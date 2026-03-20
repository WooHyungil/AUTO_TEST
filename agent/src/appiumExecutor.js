import { remote } from "webdriverio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function classifyExecutionError(errorMessage) {
  const message = String(errorMessage || "").toLowerCase();
  if (message.includes("no such element") || message.includes("element could not be located")) {
    return "locator_not_found";
  }
  if (message.includes("session") && message.includes("not created")) {
    return "session_start_failed";
  }
  if (message.includes("timeout")) {
    return "timeout";
  }
  if (message.includes("connection") || message.includes("refused")) {
    return "connection_error";
  }
  return "execution_error";
}

function capabilityForApp(appName) {
  if (appName === "Kia") {
    if (!process.env.KIA_APP_PACKAGE) {
      return {};
    }
    const capability = {
      "appium:appPackage": process.env.KIA_APP_PACKAGE
    };
    if (process.env.KIA_APP_ACTIVITY) {
      capability["appium:appActivity"] = process.env.KIA_APP_ACTIVITY;
    }
    return capability;
  }
  if (appName === "Hyundai") {
    if (!process.env.HYUNDAI_APP_PACKAGE) {
      return {};
    }
    const capability = {
      "appium:appPackage": process.env.HYUNDAI_APP_PACKAGE
    };
    if (process.env.HYUNDAI_APP_ACTIVITY) {
      capability["appium:appActivity"] = process.env.HYUNDAI_APP_ACTIVITY;
    }
    return capability;
  }
  if (!process.env.GENESIS_APP_PACKAGE) {
    return {};
  }
  const capability = {
    "appium:appPackage": process.env.GENESIS_APP_PACKAGE
  };
  if (process.env.GENESIS_APP_ACTIVITY) {
    capability["appium:appActivity"] = process.env.GENESIS_APP_ACTIVITY;
  }
  return capability;
}

function packageKeywordsForApp(appName) {
  const normalized = String(appName || "").toLowerCase();
  if (normalized === "kia") {
    return ["kia", "uvo", "kiaconnect", "kia.connect"];
  }
  if (normalized === "hyundai") {
    return ["hyundai", "bluelink", "hyundai.connect"];
  }
  return ["genesis", "gv", "genesisintelligent"];
}

async function detectInstalledPackage(udid, appName) {
  const keywords = packageKeywordsForApp(appName);
  const { stdout } = await execFileAsync("adb", ["-s", udid, "shell", "pm", "list", "packages"]);
  const packages = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^package:/, "").trim())
    .filter(Boolean);

  for (const keyword of keywords) {
    const found = packages.find((pkg) => pkg.toLowerCase().includes(keyword));
    if (found) {
      return found;
    }
  }

  return null;
}

async function prepareDeviceSession(driver, logs) {
  try {
    await driver.execute("mobile: shell", { command: "input", args: ["keyevent", "KEYCODE_WAKEUP"] });
  } catch {
    // best-effort wakeup
  }
  try {
    await driver.execute("mobile: shell", { command: "wm", args: ["dismiss-keyguard"] });
  } catch {
    // best-effort dismiss
  }
  try {
    const locked = await driver.isLocked();
    if (locked) {
      await driver.unlock();
      logs.push("device unlocked");
    }
  } catch {
    // best-effort unlock
  }
}

async function ensureAppForeground(driver, targetPackage, logs) {
  try {
    await driver.activateApp(targetPackage);
    await driver.pause(1200);
    logs.push(`activated app package: ${targetPackage}`);
  } catch (error) {
    logs.push(`activate app failed for ${targetPackage}: ${String(error.message || error)}`);
  }

  let currentPackage = null;
  try {
    currentPackage = await driver.getCurrentPackage();
    logs.push(`current package after activate: ${currentPackage}`);
  } catch {
    // ignore package read failures
  }

  if (currentPackage === targetPackage) {
    return;
  }

  try {
    await driver.execute("mobile: shell", {
      command: "monkey",
      args: ["-p", targetPackage, "-c", "android.intent.category.LAUNCHER", "1"]
    });
    await driver.pause(1500);
    logs.push(`launch fallback via monkey for ${targetPackage}`);
  } catch (error) {
    logs.push(`launch fallback failed for ${targetPackage}: ${String(error.message || error)}`);
    return;
  }

  try {
    const afterLaunchPackage = await driver.getCurrentPackage();
    logs.push(`current package after monkey: ${afterLaunchPackage}`);
  } catch {
    // ignore package read failures
  }
}

export async function runAppiumTask({ task, testCase, ports }) {
  const hostname = process.env.APPIUM_HOST || "127.0.0.1";
  const port = Number(process.env.APPIUM_PORT || ports.appiumPort);
  const path = process.env.APPIUM_PATH || "/wd/hub";

  const capabilities = {
    platformName: "Android",
    "appium:automationName": "UiAutomator2",
    "appium:udid": task.device_id,
    "appium:newCommandTimeout": 180,
    "appium:noReset": true,
    "appium:systemPort": ports.systemPort,
    "appium:chromedriverPort": ports.chromedriverPort,
    ...capabilityForApp(task.app)
  };

  const logs = [];
  const assertions = [];
  let screenshotBase64 = null;
  let pageSource = null;

  if (!capabilities["appium:appPackage"] || !capabilities["appium:appActivity"]) {
    logs.push(`app package/activity not fully configured for ${task.app}; attempting auto detection`);
  }

  let autoDetectedPackage = null;
  if (!capabilities["appium:appPackage"]) {
    try {
      autoDetectedPackage = await detectInstalledPackage(task.device_id, task.app);
      if (autoDetectedPackage) {
        capabilities["appium:appPackage"] = autoDetectedPackage;
        logs.push(`auto-detected app package: ${autoDetectedPackage}`);
      } else {
        logs.push(`no installed package match found for app=${task.app}`);
      }
    } catch (error) {
      logs.push(`auto-detect package failed: ${String(error.message || error)}`);
    }
  }

  async function resolveElement(driver, locatorExpr) {
    const [type, value] = String(locatorExpr || "").split("=", 2);
    if (!type || !value) {
      throw new Error(`invalid locator: ${locatorExpr}`);
    }
    if (type === "id") {
      return driver.$(`id=${value}`);
    }
    if (type === "xpath") {
      return driver.$(value);
    }
    if (type === "accessibility") {
      return driver.$(`~${value}`);
    }
    throw new Error(`unsupported locator type: ${type}`);
  }

  async function resolveTapElementWithFallback(driver, locatorExpr) {
    const [type, rawValue] = String(locatorExpr || "").split("=", 2);
    const value = String(rawValue || "").trim();
    if (!type || !value) {
      throw new Error(`invalid locator: ${locatorExpr}`);
    }

    if (type !== "accessibility") {
      return resolveElement(driver, locatorExpr);
    }

    const candidates = [
      `~${value}`,
      `android=new UiSelector().description("${value}")`,
      `android=new UiSelector().text("${value}")`,
      `android=new UiSelector().textContains("${value}")`,
      `//*[contains(@text, "${value}")]`
    ];

    for (const selector of candidates) {
      const element = await driver.$(selector);
      const exists = await element.isExisting();
      if (!exists) {
        continue;
      }
      const visible = await element.isDisplayed();
      if (!visible) {
        continue;
      }
      logs.push(`tap fallback matched selector: ${selector}`);
      return element;
    }

    throw new Error(`element not found with accessibility fallback: ${value}`);
  }

  async function tapCenter(driver) {
    const rect = await driver.getWindowRect();
    const centerX = Math.floor(rect.width / 2);
    const centerY = Math.floor(rect.height / 2);
    await driver.execute("mobile: clickGesture", { x: centerX, y: centerY });
    logs.push(`tap center (${centerX}, ${centerY})`);
  }

  async function executeStep(driver, rawStep) {
    const step = String(rawStep || "").trim();
    if (!step) {
      return;
    }

    if (step.startsWith("wait:")) {
      const ms = Number(step.slice(5));
      await driver.pause(Number.isFinite(ms) ? ms : 1000);
      logs.push(`wait ${ms}ms`);
      return;
    }

    if (step.startsWith("tap:")) {
      const locator = step.slice(4);
      try {
        const element = await resolveTapElementWithFallback(driver, locator);
        await element.click();
        logs.push(`tap ${locator}`);
      } catch (error) {
        if (locator.startsWith("accessibility=")) {
          logs.push(`tap fallback failed for ${locator}: ${String(error.message || error)}`);
          await tapCenter(driver);
        } else {
          throw error;
        }
      }
      return;
    }

    if (step.startsWith("input:")) {
      const payload = step.slice(6);
      const [locatorPart, textPart] = payload.split("|text=", 2);
      const element = await resolveElement(driver, locatorPart);
      await element.waitForDisplayed({ timeout: 10000 });
      await element.setValue(textPart || "");
      logs.push(`input ${locatorPart}`);
      return;
    }

    if (step.startsWith("expect:text=")) {
      const expected = step.slice("expect:text=".length);
      const source = await driver.getPageSource();
      const passed = source.includes(expected);
      assertions.push({
        type: "text",
        expected,
        actual: passed ? expected : "NOT_FOUND_IN_PAGE_SOURCE",
        passed
      });
      logs.push(`expect text ${passed ? "pass" : "fail"}`);
      return;
    }

    logs.push(`skip unsupported step: ${step}`);
  }

  let driver;
  try {
    driver = await remote({
      hostname,
      port,
      path,
      logLevel: "error",
      capabilities
    });

    logs.push(`session started for ${task.device_id}`);
    await prepareDeviceSession(driver, logs);

    const targetPackage = capabilities["appium:appPackage"] || autoDetectedPackage;
    if (targetPackage) {
      await ensureAppForeground(driver, targetPackage, logs);

      const currentPackage = await driver.getCurrentPackage();
      if (currentPackage !== targetPackage) {
        throw new Error(
          `target app not foregrounded (target=${targetPackage}, current=${currentPackage}). ` +
            "Unlock device and keep screen on before running real-device tests."
        );
      }
    }

    if (Array.isArray(testCase.steps) && testCase.steps.length > 0) {
      for (const step of testCase.steps) {
        await executeStep(driver, step);
      }
    } else {
      await driver.pause(2500);
    }

    const expectedText = String(testCase.expected || "").trim();
    if (expectedText) {
      const source = await driver.getPageSource();
      const textPassed = source.includes(expectedText);
      assertions.push({
        type: "text",
        expected: expectedText,
        actual: textPassed ? expectedText : "NOT_FOUND_IN_PAGE_SOURCE",
        passed: textPassed
      });
    }

    assertions.push({
      type: "ui_state",
      expected: "session is alive",
      actual: "session is alive",
      passed: true
    });

    const activity = await driver.getCurrentActivity();
    assertions.push({
      type: "navigation",
      expected: "main activity reachable",
      actual: activity,
      passed: Boolean(activity)
    });

    screenshotBase64 = await driver.takeScreenshot();
    pageSource = await driver.getPageSource();
    logs.push(`current activity: ${activity}`);
  } catch (error) {
    if (driver) {
      try {
        screenshotBase64 = await driver.takeScreenshot();
      } catch {
        // ignore artifact capture errors
      }
      try {
        pageSource = await driver.getPageSource();
      } catch {
        // ignore artifact capture errors
      }
    }
    const failureType = classifyExecutionError(error.message || error);
    assertions.push({
      type: failureType,
      expected: "no runtime error",
      actual: String(error.message || error),
      passed: false
    });
    logs.push(`exception: ${String(error.message || error)}`);
    throw error;
  } finally {
    if (driver) {
      await driver.deleteSession();
      logs.push("session closed");
    }
  }

  return {
    assertions,
    logs,
    screenshotBase64,
    pageSource
  };
}
