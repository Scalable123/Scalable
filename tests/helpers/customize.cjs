async function openCustomize(page) {
  const trigger = page.locator("[data-customize-trigger]");
  const dialog = page.locator("#appearance-dialog");
  if (await trigger.count()) {
    if (!(await dialog.isVisible())) await trigger.click();
  } else {
    await page.locator("[data-account-panel=appearance]").click();
  }
  await page.locator("#theme-preference").waitFor();
}
async function setTheme(page, value, close = true) {
  await openCustomize(page);
  await page.locator("#theme-preference").selectOption(value);
  if (close && (await page.locator("#appearance-dialog").isVisible()))
    await page.keyboard.press("Escape");
}
module.exports = { openCustomize, setTheme };
