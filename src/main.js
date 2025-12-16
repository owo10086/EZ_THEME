// 应用引导文件
// 负责按需加载 public/config.js，并在成功加载后再初始化 Vue 应用

// 若在 index.html 中定义了 window.EZ_LOADER，则优先使用其中的参数，以便无需重新打包即可调整
const {
  configFileName: CONFIG_FILE_NAME = 'config.js',
  configTimeout: CONFIG_TIMEOUT = 3000,
  maxRetries: MAX_RETRIES = 2
} = window.EZ_LOADER || {};

/**
 * 动态加载 config.js
 * @returns {Promise<void>} 当脚本成功加载并且 window.EZ_CONFIG 存在时 resolve
 */
function loadConfigScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    // 追加时间戳用于强制刷新 CDN 缓存，避免被旧缓存或防火墙拦截
    script.src = `${CONFIG_FILE_NAME}?t=${Date.now()}`;
    script.async = true;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Config load timeout'));
    }, CONFIG_TIMEOUT);

    script.onload = () => {
      if (window.EZ_CONFIG && Object.keys(window.EZ_CONFIG).length > 0) {
        cleanup();
        resolve();
      } else {
        cleanup();
        reject(new Error('EZ_CONFIG is empty'));
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Config script error'));
    };

    function cleanup() {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    }

    document.head.appendChild(script);
  });
}

/**
 * 带重试逻辑的加载函数
 */
async function ensureConfigLoaded() {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await loadConfigScript();
      return true;
    } catch (err) {
      console.warn(`加载配置失败，正在重试(${attempt + 1}/${MAX_RETRIES})`, err);
    }
  }
  return false;
}

(async () => {
  const loaded = await ensureConfigLoaded();
  if (!loaded) {
    alert('网站配置加载失败，系统将自动刷新页面');
    // 强制从服务器重新加载，避免缓存
    location.reload(true);
    return;
  }

  // 成功加载配置后再初始化 Vue 应用
  await import('./appInit.js');
})(); 