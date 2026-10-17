import { useEffect, useState } from "react";
import { formatVersionLine, resolveRuntimeVersion } from "../../lib/appVersion";
import "./AdminVersionBadge.css";

/** Small glass chip under the admin title: the version running on this device. */
export default function AdminVersionBadge({ t }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let alive = true;
    void resolveRuntimeVersion().then((v) => {
      if (alive) setInfo(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  const line = info
    ? formatVersionLine({ ...info, format: (v) => t("App version {version}", { version: v }) })
    : "";
  if (!line) return null;
  return (
    <span className="admin-version-badge" data-testid="admin-version" title={line}>
      {line}
    </span>
  );
}
