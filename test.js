try {
  const { ChiaBlockListener, loadChiaCerts, initTracing } = require('./index.js');
  
  console.log('✅ Module loaded successfully!');
  console.log('Available exports:', {
    ChiaBlockListener: typeof ChiaBlockListener,
    loadChiaCerts: typeof loadChiaCerts,
    initTracing: typeof initTracing
  });
  
  // Test creating an instance
  const listener = new ChiaBlockListener();
  console.log('✅ ChiaBlockListener instance created');
  
  // Test initTracing
  initTracing();
  console.log('✅ Tracing initialized');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
}