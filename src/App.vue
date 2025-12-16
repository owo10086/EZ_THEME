<template>
  <div>
    <!-- 静态布局容器，包含不需要过渡效果的菜单和按钮 -->
    <div class="static-layout" v-if="$route.meta.requiresAuth">
      <!-- 网站名称 -->
      <div class="site-logo">
        <img v-if="siteConfig.showLogo" src="/images/logo.png" alt="Logo" class="site-logo-img" />
        {{ siteConfig.siteName }}
      </div>
      
      <!-- 顶部导航栏 - 保持不变 -->
      <SlideTabsNav />
      
      <!-- 顶部工具栏：语言选择器、主题切换和用户头像 -->
      <div class="top-toolbar">
        <ThemeToggle />
        <LanguageSelector />
        <button 
          v-if="PROFILE_CONFIG.showGiftCardRedeem" 
          class="gift-btn" 
          @click="$router.push('/profile')"
        >
          <IconGift :size="20" />
        </button>
        <UserAvatar :username="username" :avatarUrl="avatarUrl" />
      </div>
    </div>

    <!-- 认证页面顶部工具栏，确保认证页面也有语言切换器 -->
    <div class="auth-toolbar" v-if="!$route.meta.requiresAuth && $route.path.includes('/auth')">
      <div class="top-toolbar">
        <ThemeToggle />
        <LanguageSelector />
      </div>
    </div>

    <!-- 路由视图只对内容部分应用过渡效果 -->
    <router-view v-slot="{ Component, route }">
      <transition 
        name="page-transition" 
        mode="out-in"
        appear
      >
        <keep-alive :include="cachedRoutes" :max="5">
          <component 
            :is="Component" 
            :key="route.path"
            :is-active="true"
          />
        </keep-alive>
      </transition>
    </router-view>
    
    <!-- 全局Toast通知 - 放在最外层，确保不受页面切换影响 -->
    <Toast />
    
    <!-- 返回顶部按钮 -->
    <BackToTop />
    
    <!-- 自定义鼠标右键菜单 -->
    <CustomContextMenu />
    
    <!-- 客服图标 -->
    <CustomerServiceIcon v-if="$route.path !== '/customer-service'" />
    
    <!-- Crisp嵌入组件（第二种客服系统方案） -->
    <CrispEmbed v-if="customerServiceConfig.embedMode === 'embed'" />
    
    <!-- 资源预加载组件 -->
    <ResourcePreloader />
    
    <!-- SVG图标定义 -->
    <IconDefinitions />
  </div>
</template>

<script>
import { onMounted, onUnmounted, ref, computed, provide, watch } from 'vue';
import { useStore } from 'vuex';
import { useTheme } from '@/composables/useTheme';
import { useRouter, useRoute } from 'vue-router';
import { SITE_CONFIG, PROFILE_CONFIG, CUSTOMER_SERVICE_CONFIG } from '@/utils/baseConfig';
import { checkAuthAndReloadMessages } from '@/utils/authUtils';
import { checkUserLoginStatus } from '@/api/auth';
import { handleRedirectPath } from '@/utils/redirectHandler';
import Toast from '@/components/common/Toast.vue';
import IconDefinitions from '@/components/icons/IconDefinitions.vue';
import SlideTabsNav from '@/components/common/SlideTabsNav.vue';
import ThemeToggle from '@/components/common/ThemeToggle.vue';
import LanguageSelector from '@/components/common/LanguageSelector.vue';
import UserAvatar from '@/components/common/UserAvatar.vue';
import BackToTop from '@/components/common/BackToTop.vue';
import CustomContextMenu from '@/components/common/CustomContextMenu.vue';
import CustomerServiceIcon from '@/components/common/CustomerServiceIcon.vue';
import CrispEmbed from '@/components/common/CrispEmbed.vue';
import ResourcePreloader from '@/components/common/ResourcePreloader.vue';
import { IconGift } from '@tabler/icons-vue';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';
import pageCache from '@/utils/pageCache';

// 配置 NProgress
NProgress.configure({ 
  showSpinner: true,   // 启用加载圆圈
  easing: 'ease',      // CSS3 动画效果
  speed: 400,          // 递增进度条的速度
  minimum: 0.2         // 最小百分比
});

export default {
  name: 'App',
  components: {
    Toast,
    IconDefinitions,
    SlideTabsNav,
    ThemeToggle,
    LanguageSelector,
    UserAvatar,
    BackToTop,
    CustomContextMenu,
    CustomerServiceIcon,
    CrispEmbed,
    ResourcePreloader,
    IconGift
  },
  setup() {
    const router = useRouter();
    const route = useRoute();
    const store = useStore();
    const { applyTheme } = useTheme();
    const siteConfig = ref(SITE_CONFIG);
    // 需要缓存的路由名称列表，使用pageCache工具管理
    const cachedRoutes = computed(() => pageCache.getCachedRoutes());
    
    // 客服配置
    const customerServiceConfig = computed(() => CUSTOMER_SERVICE_CONFIG);
    
    // 监听路由变化
    router.beforeEach((to, from, next) => {
      // 判断当前路由是否需要被缓存
      // 如果路由meta中有keepAlive为true，则缓存该路由
      if (to.meta.keepAlive && to.name) {
        pageCache.addRouteToCache(to.name);
      }
      
      // 如果上一个路由明确标记不需要被缓存 (meta.keepAlive为false)
      // 或者不存在keepAlive属性，则从缓存列表中移除
      if (from.name && from.meta.keepAlive === false) {
        pageCache.removeRouteFromCache(from.name);
      }
      
      NProgress.start();
      next();
    });
    
    router.afterEach(() => {
      NProgress.done();
    });
    
    // 处理URL中的redirect参数
    const handleRedirectParam = () => {
      let redirectParam = null;
      
      // 从URL哈希部分提取参数，例如 /#/landing?redirect=shop
      const hashParts = window.location.hash.split('?');
      if (hashParts.length > 1) {
        const hashParams = new URLSearchParams(hashParts[1]);
        redirectParam = hashParams.get('redirect');
      }
      
      // 如果在哈希部分未找到参数，则从常规查询字符串提取
      if (!redirectParam) {
        redirectParam = route.query.redirect;
      }
      
      if (redirectParam && typeof redirectParam === 'string') {
        // 使用redirectHandler中的函数处理路径
        const targetPath = handleRedirectPath(redirectParam);
        
        // 当前路径与目标路径不同时才执行跳转，避免无限重定向
        if (route.path !== targetPath) {
          // console.log('重定向到:', targetPath);
          // 使用replace避免在历史记录中创建新条目
          router.replace(targetPath);
        }
      }
    };
    
    // 监听路由变化，处理redirect参数
    watch(() => route.fullPath, () => {
      // 当路由变化时处理redirect参数
      handleRedirectParam();
    });
    
    // 用户信息
    const username = computed(() => store.getters.username);
    const avatarUrl = computed(() => store.getters.avatarUrl || '');
    
    // 语言变化信号变量，不再用于重新渲染组件，仅用于内部逻辑
    const languageChangedSignal = ref(0);
    
    // 监听语言变化事件
    const onLanguageChanged = () => {
      // 增加信号值，但不影响组件渲染
      languageChangedSignal.value++;
      
      // 添加微小延迟，允许DOM更新
      setTimeout(() => {
        // 触发页面内的文本过渡效果
        document.body.classList.add('language-transitioning');
        setTimeout(() => {
          document.body.classList.remove('language-transitioning');
        }, 300);
      }, 0);
    };
    
    // 处理页面可见性变化
    const handleVisibilityChange = () => {
      // 当页面从隐藏变为可见时，检查登录状态并重新加载消息
      if (!document.hidden) {
        checkAuthAndReloadMessages();
        
        // 检查用户登录是否过期
        checkUserLoginStatus().then(result => {
          if (result.isLoggedIn === false && result.message) {
            // 登录已过期，可通过 Toast 显示提示消息
            const { showToast } = require('@/composables/useToast').useToast();
            if (showToast) {
              showToast(result.message, 'warning');
            }
          }
        }).catch(err => {
          console.error('检查登录状态出错:', err);
        });
      }
    };
    
    // 提供语言变化信号给子组件使用
    provide('languageChangedSignal', languageChangedSignal);
    
    // 清除所有缓存的方法
    const clearCache = () => {
      pageCache.clearCache();
    };
    
    // 清除指定路由缓存的方法
    const removeCachedRoute = (routeName) => {
      pageCache.removeRouteFromCache(routeName);
    };
    
    // 提供这些方法给全局使用
    provide('clearCache', clearCache);
    provide('removeCachedRoute', removeCachedRoute);
    
    onMounted(() => {
      // 监听自定义语言变更事件
      window.addEventListener('languageChanged', onLanguageChanged);
      
      // 应用主题
      applyTheme(store.getters.currentTheme);
      
      // 检查登录状态并加载相应的i18n消息
      checkAuthAndReloadMessages();
      
      // 添加浏览器级别事件监听
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // 检查用户登录状态是否过期
      checkUserLoginStatus().then(result => {
        if (result.isLoggedIn === false && result.message) {
          // 登录已过期，可通过 Toast 显示提示消息
          const { showToast } = require('@/composables/useToast').useToast();
          if (showToast) {
            showToast(result.message, 'warning');
          }
        }
      }).catch(err => {
        console.error('检查登录状态出错:', err);
      });
      
      // 处理URL中的redirect参数
      handleRedirectParam();
    });
    
    onUnmounted(() => {
      // 移除事件监听
      window.removeEventListener('languageChanged', onLanguageChanged);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    });
    
    return {
      username,
      avatarUrl,
      siteConfig,
      PROFILE_CONFIG,
      cachedRoutes,
      customerServiceConfig
    };
  }
};
</script>

<style lang="scss">
@use "sass:math";
@use "@/assets/styles/base/variables.scss" as *;
@use "@/assets/styles/base/reset.scss" as *;
@use "@/assets/styles/base/animations.scss" as *;
@use "@/assets/styles/base/scrollbar.scss" as *;

/* 页面过渡相关的样式 */
.page-transitioning {
  overflow: hidden;
}

/* 静态布局部分 */
.static-layout {
  position: fixed;
  width: 100%;
  top: 0;
  left: 0;
  z-index: 100;
}

/* 网站Logo样式 */
.site-logo {
  position: fixed;
  top: 20px;  /* 调整上边距，使其与顶栏对齐 */
  left: 25px;
  font-size: 20px;  /* 缩小字体大小 */
  font-weight: 700;
  color: var(--theme-color);
  z-index: 110;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  letter-spacing: -0.5px;
  background-color: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 6px 14px;
  border-radius: 10px;  /* 稍微调整圆角 */
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 10px;
  
  .site-logo-img {
    height: 24px;
    width: 24px;
    border-radius: 6px;
    object-fit: cover;
  }
}

/* 暗色模式下的Logo样式调整 */
.dark-theme .site-logo {
  background-color: rgba(30, 30, 30, 0.7);
}

/* 顶部工具栏 */
.top-toolbar {
  position: fixed;
  top: 20px;
  right: 25px;
  display: flex;
  gap: 12px;
  z-index: 110;
  
  .gift-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background-color: rgba(var(--theme-color-rgb), 0.1);
    border: 1px solid rgba(var(--theme-color-rgb), 0.3);
    color: var(--theme-color);
    cursor: pointer;
    transition: all 0.3s ease;
    
    &:hover {
      box-shadow: 0 0 0 3px rgba(var(--theme-color-rgb), 0.15);
      transform: translateY(-2px);
    }
  }
}

/* 移动端响应式布局调整 */
@media (max-width: 768px) {
  .site-logo {
    top: 12px;  /* 移动端下调整位置 */
    left: 20px;
    font-size: 20px;  /* 移动端下更小的字体 */
    padding: 5px 10px;
    border-radius: 8px;
  }
  
  .top-toolbar {
    top: 12px;  /* 相应调整顶部工具栏位置 */
    right: 20px;
    gap: 10px;
  }
  
  /* 为底部导航栏预留空间 */
  main, .main-content, .content-container {
    padding-bottom: 70px !important;
    margin-bottom: 10px !important;
  }
}

/* 页面过渡动画 */
.page-transition-enter-active,
.page-transition-leave-active {
  transition: opacity 0.3s ease;
}

.page-transition-enter-from {
  opacity: 0;
}

.page-transition-leave-to {
  opacity: 0;
}

/* 语言切换过渡效果 */
.language-transitioning .language-transition-item {
  animation: language-fade 0.3s ease-out;
}

@keyframes language-fade {
  0% {
    opacity: 0.2;
  }
  100% {
    opacity: 1;
  }
}

/* 保留淡入淡出效果以兼容现有代码 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 自定义滚动条样式 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background-color: var(--input-bg-color, rgba(0, 0, 0, 0.05));
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background-color: var(--theme-color);
  border-radius: 3px;
  opacity: 0.7;
  transition: background-color 0.3s ease;
}

::-webkit-scrollbar-thumb:hover {
  background-color: var(--theme-hover-color, rgba(var(--theme-color-rgb), 0.8));
}

::-webkit-scrollbar-corner {
  background-color: transparent;
}

/* Firefox 滚动条样式 */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--theme-color) var(--input-bg-color, rgba(0, 0, 0, 0.05));
}

/* 确保滚动效果平滑 */
html {
  scroll-behavior: smooth;
}

/* 为认证页面添加工具栏样式 */
.auth-toolbar {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 100;
  
  .top-toolbar {
    position: fixed;
    top: 20px;
    right: 25px;
    display: flex;
    gap: 12px;
    z-index: 110;
  }
}

/* 确保eztheme-btn样式不受任何Markdown链接样式的影响 */
.eztheme-btn {
  text-decoration: none !important;
  border-bottom: none !important;
  background-image: none !important;
  background-repeat: no-repeat !important;
  background-position: initial !important;
  background-size: initial !important;
  
  &:hover, &:active, &:focus, &:visited {
    text-decoration: none !important;
    border-bottom: none !important;
  }
  
  &::after, &::before {
    display: none !important;
    content: none !important;
  }
}

/* 自定义 NProgress 样式 */
#nprogress {
  pointer-events: none;
  
  .bar {
    background: var(--theme-color);
    position: fixed;
    z-index: 1031;
    top: 0;
    left: 0;
    width: 100%;
    height: 2px;
    box-shadow: 0 0 10px var(--theme-color), 0 0 5px var(--theme-color);
  }
  
  /* 自定义加载圆圈样式 */
  .spinner {
    display: block;
    position: fixed;
    z-index: 1031;
    top: 10px;  /* 距离顶部的距离 */
    left: 10px; /* 距离左侧的距离 */
    
    .spinner-icon {
      width: 18px;
      height: 18px;
      box-sizing: border-box;
      border: solid 2px transparent;
      border-top-color: var(--theme-color);
      border-left-color: var(--theme-color);
      border-radius: 50%;
      animation: nprogress-spinner 400ms linear infinite;
    }
  }
}

@keyframes nprogress-spinner {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* 确保进度条在最顶层 */
.nprogress-custom-parent {
  overflow: hidden;
  position: relative;
}

.nprogress-custom-parent #nprogress .bar {
  position: absolute;
}
</style> 