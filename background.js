// Background service worker for LinkedIn Job Insights Extension

chrome.runtime.onInstalled.addListener((details) => {
    const manifest = chrome.runtime.getManifest();
    
    if (details.reason === 'install') {
        console.log(`🎉 LinkedIn Job Insights v${manifest.version} installed successfully!`);
        console.log('💎 Beautiful glassmorphism floating card ready to use on LinkedIn job pages');
    } else if (details.reason === 'update') {
        console.log(`🔄 LinkedIn Job Insights updated to v${manifest.version}`);
        console.log('✨ Check out the latest improvements and features');
    }
});