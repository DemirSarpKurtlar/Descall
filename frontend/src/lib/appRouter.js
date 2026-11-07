/**
 * The two routers the app boot needs, behind a module so main.jsx can load them lazily
 * without pulling the whole react-router namespace (a dynamic import of
 * "react-router-dom" itself keeps every export and defeats tree-shaking).
 */
export { BrowserRouter, HashRouter } from "react-router-dom";
