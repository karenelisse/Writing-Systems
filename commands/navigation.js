function openPaired(plugin, type) {
  return plugin.openPaired(type);
}

function validateBook(plugin) {
  return plugin.validateBook();
}

module.exports = { openPaired, validateBook };
