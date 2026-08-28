/**
 * Per-device sequential dispatch queue with hardware-ACK tracking for
 * photo/strategy commands. The e-paper frame can process exactly ONE payload
 * at a time (download → dither → refresh), so the backend must FIFO-queue
 * every cast and only advance when the frame reports a display-complete ACK.
 *
 * Status lifecycle:
 *   uploaded            → queued (waiting for prior task)
 *   queued              → dispatched_to_device (MQTT published for this task)
 *   dispatched_to_device→ device_processing (interim ACK received)
 *   device_processing   → completed (final ACK: displayed/stopped) | failed
 *
 * A 60-second fallback timeout per task flips the queue to `failed` and
 * advances to the next pending task so a hung/dead frame does not block.
 */

export type DispatchTaskStatus =
  | 'uploaded'
  | 'queued'
  | 'dispatched_to_device'
  | 'device_processing'
  | 'completed'
  | 'failed';

export interface FrameDispatchItem {
  taskId: string;
  frameMac: string;
  type: 'photo' | 'strategy' | 'playlist';
  /** Raw payload used by the dispatcher callback to build the publish body. */
  payload: Record<string, unknown>;
  status?: DispatchTaskStatus;
  createdAt?: number;
  updatedAtMs?: number;
  /** Downlink MQTT msgid used to correlate hardware ACK (set on dispatch). */
  msgid?: string;
  /** Optional queue-position snapshot persisted so API answers stay stable. */
  queuePosition?: number;
  /** Frame-side visible name for display (e.g. photo filename or playlist title). */
  displayName?: string;
  /** Number of failed dispatch attempts so far (drives auto-retry). */
  attempts?: number;
  /** Last failure reason (surfaced via status API). */
  lastError?: string;
}

/** Callback registered by the MQTT layer to actually publish a task. */
export type DispatchExecutor = (task: FrameDispatchItem) => Promise<string | undefined>;

class FrameDispatchQueue {
  /** All known tasks; the in-memory ledger consumed by /api/tasks/:taskId/status. */
  private readonly tasks = new Map<string, FrameDispatchItem>();
  /** Per-firmware FIFO (oldest at index 0) keyed by normalized STA MAC. */
  private readonly queues = new Map<string, string[]>();
  /** Task id currently in flight per frame Mac. */
  private readonly active = new Map<string, string>();
  /** Dispatcher callback (set via registerDispatcher). */
  private executor: DispatchExecutor | null = null;
  /** Timeout guard (ms). */
  private readonly timeoutMs = 60_000;
  private readonly timeouts = new Map<string, NodeJS.Timeout>();

  registerDispatcher(executor: DispatchExecutor): void {
    this.executor = executor;
  }

  enqueue(task: FrameDispatchItem): FrameDispatchItem {
    task.status = 'uploaded';
    task.createdAt = task.createdAt || Date.now();
    task.updatedAtMs = Date.now();
    this.tasks.set(task.taskId, task);
    const queue = this.queues.get(task.frameMac) ?? [];
    queue.push(task.taskId);
    this.queues.set(task.frameMac, queue);
    this._transitionToQueued(task);
    this._maybeDispatchNext(task.frameMac);
    return task;
  }

  private _transitionToQueued(task: FrameDispatchItem): void {
    const idx = (this.queues.get(task.frameMac) ?? []).indexOf(task.taskId) + 1;
    task.status = 'queued';
    task.queuePosition = idx;
    task.updatedAtMs = Date.now();
    this.tasks.set(task.taskId, task);
  }

  private _maybeDispatchNext(frameMac: string): void {
    if (this.active.has(frameMac)) return;
    const queue = this.queues.get(frameMac) ?? [];
    if (queue.length === 0) {
      this.queues.delete(frameMac);
      return;
    }
    const taskId = queue[0];
    const task = this.tasks.get(taskId);
    if (!task) return;
    this._dispatch(task, frameMac);
  }

  private _dispatch(task: FrameDispatchItem, frameMac: string): void {
    this.active.set(frameMac, task.taskId);
    task.status = 'dispatched_to_device';
    task.updatedAtMs = Date.now();
    this.tasks.set(task.taskId, task);

    const queue = this.queues.get(frameMac) ?? [];
    task.queuePosition = queue.indexOf(task.taskId) + 1;

    const executor = this.executor;
    if (!executor) {
      console.error("[dispatch-queue] executor not registered — task stuck", task.taskId);
      this._fail(frameMac, task, 'executor_not_registered');
      return;
    }
    executor(task)
      .then((msgid) => {
        if (msgid) {
          task.msgid = msgid;
          task.updatedAtMs = Date.now();
          this.tasks.set(task.taskId, task);
        }
        // Task will be marked completed when the frame's display-complete ACK
        // hits handleFrameMqttAction (next block), OR after timeout below.
        this._armTimeout(frameMac, task);
      })
      .catch((err) => {
        console.error("[dispatch-queue] publish failed", task.taskId, err);
        this._fail(frameMac, task, err?.message ?? 'publish_failed');
      });
  }

  private _armTimeout(frameMac: string, task: FrameDispatchItem): void {
    this._clearTimeout(task.taskId);
    const t = setTimeout(() => {
      const stuck = this.tasks.get(task.taskId);
      if (stuck && stuck.status !== 'completed' && stuck.status !== 'failed') {
        console.warn('[dispatch-queue] timeout — marking failed', task.taskId);
        this._fail(frameMac, stuck, 'timeout_no_ack');
      }
    }, this.timeoutMs);
    this.timeouts.set(task.taskId, t);
  }

  private _clearTimeout(taskId: string): void {
    const existing = this.timeouts.get(taskId);
    if (existing) { clearTimeout(existing); this.timeouts.delete(taskId); }
  }

  private _fail(frameMac: string, task: FrameDispatchItem, reason?: string): void {
    task.lastError = reason;
    task.attempts = (task.attempts ?? 0) + 1;
    task.updatedAtMs = Date.now();
    this.tasks.set(task.taskId, task);

    // Transient firmware download failures (weak WiFi truncation, a busy
    // refresh cycle) recover on retry: re-dispatch the same task after a
    // short backoff instead of failing the queue outright.
    const maxAttempts = 3;
    if ((task.attempts ?? 0) < maxAttempts) {
      task.status = 'queued';
      task.queuePosition = this._peekIndex(frameMac, task.taskId) + 1;
      console.warn(
        '[dispatch-queue] %s task %s failed (%s) — retry %d/%d in 6s',
        frameMac, task.taskId, reason ?? 'unknown', task.attempts, maxAttempts,
      );
      const t = setTimeout(() => {
        this._clearTimeout(task.taskId);
        this._maybeDispatchNext(frameMac);
      }, 6_000);
      this.timeouts.set(task.taskId, t);
      return;
    }

    task.status = 'failed';
    task.updatedAtMs = Date.now();
    this.tasks.set(task.taskId, task);
    this._advance(frameMac, task);
    const next = this._peek(frameMac) ?? null;
    if (next) {
      console.log('[dispatch-queue]', frameMac, 'task failed permanently', reason, '→ advancing to', next);
    }
  }

  private _peekIndex(frameMac: string, taskId: string): number {
    const queue = this.queues.get(frameMac) ?? [];
    return queue.indexOf(taskId);
  }

  private _advance(frameMac: string, task: FrameDispatchItem): void {
    const queue = this.queues.get(frameMac) ?? [];
    const idx = queue.indexOf(task.taskId);
    if (idx >= 0) queue.splice(idx, 1);
    if (queue.length === 0) {
      this.queues.delete(frameMac);
      this.active.delete(frameMac);
    } else {
      this.queues.set(frameMac, queue);
    }
    this._clearTimeout(task.taskId);
    if (this.active.get(frameMac) === task.taskId) {
      this.active.delete(frameMac);
      this._maybeDispatchNext(frameMac);
    }
  }

  private _peek(frameMac: string): string | undefined {
    const queue = this.queues.get(frameMac) ?? [];
    return queue[0];
  }

  /**
   * Mark the current in-flight task complete upon receiving the frame's
   * display-complete ACK (`result 113 / displayed` path). Falls back to
   * match-by-frameMac when ack_msgid mismatches (firmware quirks).
   */
  public handleAck(frameMac: string, opts?: { action?: string; ackMsgid?: string; result?: number; deliveredMsgid?: string }): void {
    const taskId = this.active.get(frameMac);
    if (!taskId) return;
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = 'completed';
    task.updatedAtMs = Date.now();
    this.tasks.set(task.taskId, task);
    this._advance(frameMac, task);
  }

  /** Fail the current task when the frame reports an explicit failure code. */
  public handleFailure(frameMac: string, reason?: string): void {
    const taskId = this.active.get(frameMac);
    if (!taskId) return;
    const task = this.tasks.get(taskId);
    if (!task) return;
    this._fail(frameMac, task, reason);
  }

  public getTask(taskId: string): FrameDispatchItem | undefined {
    return this.tasks.get(taskId);
  }

  public getActiveTask(frameMac: string): FrameDispatchItem | undefined {
    const taskId = this.active.get(frameMac);
    if (!taskId) return undefined;
    return this.tasks.get(taskId);
  }

  public queuePosition(frameMac: string, taskId: string): number | undefined {
    const queue = this.queues.get(frameMac) ?? [];
    const idx = queue.indexOf(taskId);
    return idx >= 0 ? idx + 1 : undefined;
  }

  /** Serialise for the HTTP status endpoint. */
  public toApiView(task: FrameDispatchItem): {
    taskId: string;
    status: DispatchTaskStatus;
    progress: 0 | 1;
    queuePosition: number | undefined;
    completed: boolean;
    updatedAtMs: number;
    displayName?: string;
    attempts?: number;
    lastError?: string;
  } {
    return {
      taskId: task.taskId,
      status: task.status ?? 'queued',
      progress: task.status === 'completed' ? 1 : 0,
      queuePosition: this.queuePosition(task.frameMac, task.taskId),
      completed: task.status === 'completed',
      updatedAtMs: task.updatedAtMs ?? task.createdAt ?? Date.now(),
      displayName: task.displayName,
      attempts: task.attempts,
      lastError: task.lastError,
    };
  }
}

/** Singleton. */
export const dispatchQueue = new FrameDispatchQueue();
