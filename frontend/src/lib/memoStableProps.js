import { createElement, isValidElement, memo, useInsertionEffect, useRef } from "react";

/**
 * memo() for a component whose parent passes inline callbacks (App -> AppLayout).
 *
 * Every function prop is swapped for a proxy with a fixed identity that calls
 * the latest function, so a parent re-render that only re-creates handlers no
 * longer re-renders the child. The child still re-renders when a data prop
 * changes (shallow compare). `children` that is one element (App passes the
 * MessageList element) counts as equal when its type, key and props are
 * shallowly equal: the element object itself is new on every parent render.
 *
 * Only for components that call their function props from events and effects,
 * never during render to produce output (a skipped render would show the old
 * output). A prop that switches between a function and undefined changes the
 * compare, as before.
 */

function shallowEqualObjects(a, b, skip) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (k === skip) continue;
    if (!Object.prototype.hasOwnProperty.call(b, k) || !Object.is(a[k], b[k])) return false;
  }
  return true;
}

export function sameChildren(a, b) {
  if (Object.is(a, b)) return true;
  if (isValidElement(a) && isValidElement(b)) {
    return a.type === b.type && a.key === b.key && shallowEqualObjects(a.props, b.props);
  }
  return false;
}

export function propsEqualWithChildren(prev, next) {
  return shallowEqualObjects(prev, next, "children") && sameChildren(prev.children, next.children);
}

export function memoStableProps(Component, name) {
  const Inner = memo(Component, propsEqualWithChildren);
  function StableProps(props) {
    const latest = useRef(props);
    // Render-time write too: a proxy called while the child renders (or from a
    // layout effect in the same commit) must see this render's handler.
    latest.current = props;
    useInsertionEffect(() => {
      latest.current = props;
    });
    const proxies = useRef(null);
    if (!proxies.current) proxies.current = new Map();
    const out = {};
    for (const key of Object.keys(props)) {
      const value = props[key];
      if (typeof value === "function" && key !== "children") {
        let proxy = proxies.current.get(key);
        if (!proxy) {
          proxy = (...args) => {
            const fn = latest.current[key];
            return typeof fn === "function" ? fn(...args) : undefined;
          };
          proxies.current.set(key, proxy);
        }
        out[key] = proxy;
      } else {
        out[key] = value;
      }
    }
    return createElement(Inner, out);
  }
  StableProps.displayName = `Stable(${name || Component.displayName || Component.name || "Component"})`;
  return StableProps;
}
