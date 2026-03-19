import { exec } from "node:child_process";

function parseAdbDevices(raw) {
  const lines = raw.split("\n").slice(1);
  return lines
    .map((line) => line.trim())
    .filter((line) => line.endsWith("device"))
    .map((line) => line.split("\t")[0]);
}

export function scanConnectedAndroidDevices() {
  return new Promise((resolve) => {
    exec("adb devices", (error, stdout) => {
      if (error) {
        resolve([]);
        return;
      }
      resolve(parseAdbDevices(stdout));
    });
  });
}
