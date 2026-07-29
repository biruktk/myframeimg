"use client";

import { useEffect, useState } from "react";

type Props = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

export function CartNavLink({ href, className, children }: Props) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function read() {
      try {
        const cart = JSON.parse(localStorage.getItem("frampCart") || "{}") as Record<string, number>;
        setCount(Object.values(cart).reduce((s, q) => s + q, 0));
      } catch {
        setCount(0);
      }
    }
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "frampCart" || e.key === null) read();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("myframe-cart", read);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("myframe-cart", read);
    };
  }, []);

  return (
    <a href={href} className={className ?? "nav-cart-link"}>
      {children}
      <span className="cart-badge" style={{ display: count > 0 ? "inline-flex" : "none" }}>
        {count}
      </span>
    </a>
  );
}
