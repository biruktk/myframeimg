import React from "react";

function tokenizeJson(jsonStr: string) {
  const tokens: { type: string; value: string }[] = [];
  let i = 0;
  const s = jsonStr;

  while (i < s.length) {
    if (/\s/.test(s[i])) {
      let w = "";
      while (i < s.length && /\s/.test(s[i])) {
        w += s[i];
        i++;
      }
      tokens.push({ type: "whitespace", value: w });
      continue;
    }
    if (s[i] === '"') {
      let w = '"';
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\") {
          w += s[i];
          i++;
          if (i < s.length) {
            w += s[i];
            i++;
          }
        } else {
          w += s[i];
          i++;
        }
      }
      if (i < s.length) w += s[i++];
      let j = i;
      while (j < s.length && /\s/.test(s[j])) j++;
      tokens.push({ type: j < s.length && s[j] === ":" ? "key" : "string", value: w });
      continue;
    }
    if (/[\{\}\[\]:,]/.test(s[i])) {
      tokens.push({ type: "punctuation", value: s[i++] });
      continue;
    }
    if (/\d/.test(s[i]) || (s[i] === "-" && i + 1 < s.length && /\d/.test(s[i + 1]))) {
      let w = "";
      if (s[i] === "-") {
        w += s[i];
        i++;
      }
      while (i < s.length && /\d/.test(s[i])) {
        w += s[i];
        i++;
      }
      if (i < s.length && s[i] === ".") {
        w += s[i];
        i++;
        while (i < s.length && /\d/.test(s[i])) {
          w += s[i];
          i++;
        }
      }
      tokens.push({ type: "number", value: w });
      continue;
    }
    const rest = s.slice(i);
    if (rest.startsWith("true")) {
      tokens.push({ type: "boolean", value: "true" });
      i += 4;
      continue;
    }
    if (rest.startsWith("false")) {
      tokens.push({ type: "boolean", value: "false" });
      i += 5;
      continue;
    }
    if (rest.startsWith("null")) {
      tokens.push({ type: "null", value: "null" });
      i += 4;
      continue;
    }
    tokens.push({ type: "punctuation", value: s[i++] });
  }
  return tokens;
}

const styleMap: Record<string, string> = {
  key: "text-[#c678dd]",
  string: "text-[#98c379]",
  number: "text-[#d19a66]",
  boolean: "text-[#e5c07b]",
  null: "text-[#5c6370]",
  punctuation: "text-foreground/90",
};

interface JsonHighlightProps {
  data: string | object;
  className?: string;
}

export function JsonHighlight({ data, className = "" }: JsonHighlightProps) {
  let jsonStr: string;
  try {
    jsonStr = typeof data === "string" ? data : JSON.stringify(data);
    try {
      jsonStr = JSON.stringify(JSON.parse(jsonStr), null, 2);
    } catch {
      /* keep raw */
    }
  } catch {
    jsonStr = String(data);
  }

  const tokens = tokenizeJson(jsonStr);

  return (
    <pre className={`font-mono text-xs overflow-x-auto whitespace-pre break-words ${className}`}>
      <code>
        {tokens.map((t, i) => {
          if (t.type === "whitespace") return <span key={i}>{t.value}</span>;
          return (
            <span key={i} className={styleMap[t.type] || styleMap.punctuation}>
              {t.value}
            </span>
          );
        })}
      </code>
    </pre>
  );
}
