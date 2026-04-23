const { add } = require('../core/ignore-method');

const selector = process.argv[2];

if (!selector) {
  console.error('Usage: node terminal/insert-ignore-method.js <selector>');
  console.error('Example: node terminal/insert-ignore-method.js 0xa9059cbb');
  process.exit(1);
}

try {
  const added = add(selector);
  if (added) {
    console.log('Da them:', selector.toLowerCase());
  } else {
    console.log('Da ton tai:', selector.toLowerCase());
  }
} catch (err) {
  console.error('Loi:', err.message);
  process.exit(1);
}
