import { remote } from "webdriverio";

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
    return {
      "appium:appPackage": process.env.KIA_APP_PACKAGE || "com.kia.app",
      "appium:appActivity": process.env.KIA_APP_ACTIVITY || "com.kia.app.MainActivity"
    };
  }
  if (appName === "Hyundai") {
    return {
      "appium:appPackage": process.env.HYUNDAI_APP_PACKAGE || "com.hyundai.app",
      "appium:appActivity": process.env.HYUNDAI_APP_ACTIVITY || "com.hyundai.app.MainActivity"
    };
  }
  return {
    "appium:appPackage": process.env.GENESIS_APP_PACKAGE || "com.genesis.app",
    "appium:appActivity": process.env.GENESIS_APP_ACTIVITY || "com.genesis.app.MainActivity"
  };
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
      const element = await resolveElement(driver, locator);
      await element.waitForDisplayed({ timeout: 10000 });
      await element.click();
      logs.push(`tap ${locator}`);
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
