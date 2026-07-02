"use client";

import { useState } from "react";
import { BookOpen, PlayCircle, List, ChevronDown, ChevronRight } from "lucide-react";

import { QUICK_GUIDE_ITEMS } from "./data/quick-guide";
import { DEMO_STEPS } from "./data/demo";
import { useDevStore } from "./store/use-dev-store";
import type { MenuSection } from "./types";

const SECTION_META: Record<MenuSection, { label: string; icon: typeof BookOpen }> = {
  "quick-guide": { label: "Quick Guide", icon: BookOpen },
  demo: { label: "Demo", icon: PlayCircle },
  "api-list": { label: "API List", icon: List },
};

export function DevMenu() {
  const {
    selectedSection,
    setSelectedSection,
    selectedApi,
    setSelectedApi,
    selectedItemId,
    setSelectedItemId,
    groupedApis,
  } = useDevStore();

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    const next = new Set(collapsedSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    setCollapsedSections(next);
  };

  const toggleCategory = (cat: string) => {
    const next = new Set(collapsedCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setCollapsedCategories(next);
  };

  const handleSectionClick = (section: MenuSection) => {
    setSelectedSection(section);
    if (section === "quick-guide") setSelectedItemId(QUICK_GUIDE_ITEMS[0]?.id ?? null);
    if (section === "demo") setSelectedItemId(DEMO_STEPS[0]?.id ?? null);
  };

  const sectionKeys: MenuSection[] = ["quick-guide", "demo", "api-list"];

  return (
    <div className="flex flex-col h-full">
      {sectionKeys.map((sectionKey) => {
        const meta = SECTION_META[sectionKey];
        const Icon = meta.icon;
        const isActive = selectedSection === sectionKey;
        const isCollapsed = collapsedSections.has(sectionKey);

        return (
          <div key={sectionKey}>
            <button
              type="button"
              onClick={() => {
                handleSectionClick(sectionKey);
                toggleSection(sectionKey);
              }}
              className={`w-full px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary border-l-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon size={16} />
              <span className="flex-1 text-left">{meta.label}</span>
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>

            {!isCollapsed && sectionKey === "quick-guide" && (
              <div className="space-y-0.5 px-2 pb-2">
                {QUICK_GUIDE_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedSection("quick-guide");
                      setSelectedItemId(item.id);
                    }}
                    className={`w-full px-3 py-2 text-xs rounded-lg transition-colors text-left ${
                      selectedSection === "quick-guide" && selectedItemId === item.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}

            {!isCollapsed && sectionKey === "demo" && (
              <div className="space-y-0.5 px-2 pb-2">
                {DEMO_STEPS.map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      setSelectedSection("demo");
                      setSelectedItemId(step.id);
                    }}
                    className={`w-full px-3 py-2 text-xs rounded-lg transition-colors text-left ${
                      selectedSection === "demo" && selectedItemId === step.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    {step.title}
                  </button>
                ))}
              </div>
            )}

            {!isCollapsed && sectionKey === "api-list" && (
              <div className="space-y-0.5 px-2 pb-2">
                {Object.entries(groupedApis).map(([category, apis]) => (
                  <div key={category}>
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="w-full px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground hover:bg-secondary rounded-lg transition-colors flex items-center justify-between"
                    >
                      {category}
                      <span className="text-[10px] opacity-60">{collapsedCategories.has(category) ? "+" : "−"}</span>
                    </button>
                    {!collapsedCategories.has(category) && (
                      <div className="space-y-0.5 pl-2">
                        {apis.map((api) => (
                          <button
                            key={api.id}
                            type="button"
                            onClick={() => setSelectedApi(api)}
                            className={`w-full px-2 py-1.5 text-xs flex items-center gap-1.5 rounded-lg transition-colors text-left ${
                              selectedApi?.id === api.id
                                ? "bg-primary/10 text-primary font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                            }`}
                          >
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                api.method === "GET"
                                  ? "bg-blue-600/80 text-white"
                                  : api.method === "POST"
                                    ? "bg-emerald-600/80 text-white"
                                    : api.method === "PUT"
                                      ? "bg-amber-600/80 text-white"
                                      : "bg-red-600/80 text-white"
                              }`}
                            >
                              {api.method}
                            </span>
                            <span className="truncate flex-1 min-w-0">{api.nameEn}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
