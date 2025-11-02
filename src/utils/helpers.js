// Helper function to find elements by XPath (replaces deprecated page.$x)
export async function findByXPath(page, xpath) {
  return await page.evaluate((xpathExpr) => {
    const result = document.evaluate(
      xpathExpr,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    const elements = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      elements.push(result.snapshotItem(i));
    }
    return elements;
  }, xpath);
}

// Click element by XPath
export async function clickByXPath(page, xpath) {
  const clicked = await page.evaluate((xpathExpr) => {
    const result = document.evaluate(
      xpathExpr,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );

    const element = result.singleNodeValue;
    if (element) {
      element.click();
      return true;
    }
    return false;
  }, xpath);

  return clicked;
}

// Get text content by XPath
export async function getTextByXPath(page, xpath) {
  return await page.evaluate((xpathExpr) => {
    const result = document.evaluate(
      xpathExpr,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );

    const element = result.singleNodeValue;
    return element ? element.textContent : null;
  }, xpath);
}

// Check if element exists by XPath
export async function existsByXPath(page, xpath) {
  const exists = await page.evaluate((xpathExpr) => {
    const result = document.evaluate(
      xpathExpr,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );

    return result.singleNodeValue !== null;
  }, xpath);

  return exists;
}
