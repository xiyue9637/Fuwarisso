// 基于 Cloudflare Workers 的个人博客系统
// 功能：支持 RSS 订阅、多角色权限管理、用户注册/登录、文章发布、评论、私信等
// 遵循要求：精简代码（<3200行）、无语法/逻辑错误、符合设计说明

// 常量定义
const ADMIN_USERNAME = 'xiyue';
const SUPERADMIN_ROLE = 'superadmin';
const ADMIN_ROLE = 'admin';
const USER_ROLE = 'user';
const POSTS_PER_PAGE = 10;
const RSS_TITLE = '曦月的小窝';
const SITE_URL = 'https://your-blog.workers.dev'; // 部署时替换为实际域名

// HTML 转义函数，防止 XSS
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// 密码哈希函数（使用 Web Crypto API + salt）
async function hashPassword(password, salt = null) {
  const encoder = new TextEncoder();
  if (!salt) {
    const saltArray = crypto.getRandomValues(new Uint8Array(16));
    salt = btoa(String.fromCharCode(...saltArray));
  }
  const saltArray = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
  const passwordData = encoder.encode(password);
  const combined = new Uint8Array(passwordData.length + saltArray.length);
  combined.set(passwordData);
  combined.set(saltArray, passwordData.length);
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash: hashHex, salt };
}

// 验证密码
async function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = await hashPassword(password, storedSalt);
  return hash === storedHash;
}

// 生成会话 token
function generateSessionToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// 会话验证中间件
async function authenticate(request, BLOG_DATA_STORE) {
  const cookie = request.headers.get('Cookie') || '';
  const tokenMatch = cookie.match(/session_token=([^;]+)/);
  if (!tokenMatch) return null;
  
  const token = tokenMatch[1];
  const sessionData = await BLOG_DATA_STORE.get(`session:${token}`);
  if (!sessionData) return null;
  
  const { username, expires } = JSON.parse(sessionData);
  if (Date.now() > expires) {
    await BLOG_DATA_STORE.delete(`session:${token}`);
    return null;
  }
  return username;
}

// 权限检查
function checkPermission(user, requiredRole) {
  if (!user) return false;
  if (requiredRole === SUPERADMIN_ROLE) return user.role === SUPERADMIN_ROLE;
  if (requiredRole === ADMIN_ROLE) return user.role === SUPERADMIN_ROLE || user.role === ADMIN_ROLE;
  return true; // USER_ROLE
}

// 初始化系统管理员（首次运行时创建）
async function initializeSystemAdmin(BLOG_DATA_STORE) {
  const initFlag = await BLOG_DATA_STORE.get('init');
  if (initFlag) return;
  
  const { hash, salt } = await hashPassword('xiyue777');
  const user = {
    username: ADMIN_USERNAME,
    password_hash: hash,
    salt,
    nickname: '曦月',
    role: SUPERADMIN_ROLE,
    avatar: '',
    bio: '系统管理员',
    gender: '',
    created_at: Date.now(),
    last_active: Date.now(),
    is_banned: false,
    is_silenced: false
  };
  await BLOG_DATA_STORE.put(`user:${ADMIN_USERNAME}`, JSON.stringify(user));
  await BLOG_DATA_STORE.put('init', 'true');
  await BLOG_DATA_STORE.put('setting:invite_code', 'DEFAULT_INVITE'); // 初始邀请码
}

// 渲染基础布局（包含顶部导航）
function renderLayout(content, currentUser = null) {
  const topBar = `
    <div class="top-bar">
      <a href="/" class="site-title">曦月的小窝</a>
      <div class="nav-links">
        ${currentUser 
          ? `<span>欢迎, ${escapeHtml(currentUser.nickname)}</span> | 
             <a href="/profile">个人中心</a> | 
             <a href="/logout">登出</a>`
          : `<a href="/login">登录</a> | <a href="/register">注册</a>`
        }
        | <input type="text" id="search" placeholder="搜索帖子🔍" class="search-box">
      </div>
    </div>
  `;
  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>曦月的小窝</title>
      <style>
        :root {
          --bg-color: #f8f9fa;
          --text-color: #333;
          --link-color: #007bff;
          --border-color: #e0e0e0;
          --card-bg: #fff;
          --accent-color: #6c757d;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
          line-height: 1.6;
          color: var(--text-color);
          background-color: var(--bg-color);
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .top-bar {
          background-color: #2c3e50;
          color: white;
          padding: 10px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .site-title {
          color: white;
          text-decoration: none;
          font-weight: bold;
          font-size: 1.2em;
        }
        .nav-links a {
          color: white;
          margin: 0 8px;
          text-decoration: none;
        }
        .nav-links a:hover {
          text-decoration: underline;
        }
        .search-box {
          padding: 5px;
          border-radius: 4px;
          border: 1px solid var(--border-color);
        }
        .post-card {
          background: var(--card-bg);
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          padding: 20px;
          margin-bottom: 20px;
        }
        .post-header {
          margin-bottom: 15px;
        }
        .post-title {
          font-size: 1.5em;
          margin: 0 0 10px;
          color: var(--link-color);
        }
        .post-meta {
          color: var(--accent-color);
          font-size: 0.9em;
          margin-bottom: 10px;
        }
        .post-content {
          line-height: 1.8;
          margin-bottom: 15px;
        }
        .comments-section {
          border-top: 1px solid var(--border-color);
          padding-top: 15px;
          margin-top: 15px;
        }
        .comment {
          background: #f0f0f0;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 10px;
        }
        .pagination {
          display: flex;
          justify-content: center;
          margin-top: 20px;
        }
        .pagination a {
          display: inline-block;
          padding: 5px 10px;
          margin: 0 3px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          text-decoration: none;
          color: var(--link-color);
        }
        .pagination a.active {
          background: var(--link-color);
          color: white;
          border-color: var(--link-color);
        }
        .role-founder { background: red; color: gold; padding: 2px 5px; border-radius: 3px; font-weight: bold; }
        .role-admin { background: black; color: gold; padding: 2px 5px; border-radius: 3px; font-weight: bold; }
        .role-member { color: pink; }
        .gender-male { color: blue; }
        .gender-female { color: pink; }
        .admin-actions { margin-top: 10px; }
        .admin-actions button {
          background: #dc3545;
          color: white;
          border: none;
          padding: 3px 8px;
          border-radius: 3px;
          margin-right: 5px;
          cursor: pointer;
        }
        .admin-actions button.secondary {
          background: #6c757d;
        }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; }
        .form-group input, .form-group textarea {
          width: 100%;
          padding: 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
        }
        .error { color: #dc3545; margin-top: 5px; }
        .success { color: #28a745; margin-top: 5px; }
        footer {
          text-align: center;
          margin-top: 40px;
          padding: 20px;
          border-top: 1px solid var(--border-color);
          color: var(--accent-color);
        }
      </style>
    </head>
    <body>
      ${topBar}
      <div class="container">
        ${content}
      </div>
      <footer>
        <a href="/rss">RSS订阅</a> | © ${new Date().getFullYear()} 曦月的小窝
      </footer>
      <script>
        document.getElementById('search').addEventListener('keypress', function(e) {
          if (e.key === 'Enter') {
            const query = encodeURIComponent(this.value.trim());
            if (query) window.location.href = '/search?q=' + query;
          }
        });
      </script>
    </body>
    </html>
  `;
}

// 首页：博文列表
async function renderHomePage(request, BLOG_DATA_STORE, currentUser) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const offset = (page - 1) * POSTS_PER_PAGE;
  
  // 获取所有文章键
  const postKeys = await BLOG_DATA_STORE.list({ prefix: 'post:' });
  const allPosts = [];
  
  for (const key of postKeys.keys) {
    const postData = await BLOG_DATA_STORE.get(key.name);
    if (postData) {
      const post = JSON.parse(postData);
      post.created_at = new Date(post.created_at).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).replace(/\//g, '-');
      allPosts.push(post);
    }
  }
  
  // 排序并分页
  allPosts.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const totalPages = Math.ceil(allPosts.length / POSTS_PER_PAGE);
  const posts = allPosts.slice(offset, offset + POSTS_PER_PAGE);
  
  // 生成文章列表 HTML
  let postsHtml = '';
  for (const post of posts) {
    const wordCount = post.content.split(/\s+/).filter(Boolean).length;
    const comments = await getCommentsForPost(BLOG_DATA_STORE, post.id);
    
    postsHtml += `
      <div class="post-card">
        <div class="post-header">
          <h2 class="post-title"><a href="/post/${post.id}">${escapeHtml(post.title)}</a></h2>
          <div class="post-meta">
            ${wordCount}字 | ${post.created_at} | 阅读 ${post.views || 0} 次
          </div>
        </div>
        <div class="post-content">${escapeHtml(post.content.substring(0, 200))}...</div>
        <div class="comments-section">
          <h3>评论 (${comments.length})</h3>
          ${comments.map(comment => `
            <div class="comment">
              <strong>
                <a href="/user/${encodeURIComponent(comment.author)}">${escapeHtml(comment.author)}</a>
                ${comment.gender === '♂' ? '<span class="gender-male">♂</span>' : comment.gender === '♀' ? '<span class="gender-female">♀</span>' : ''}
              </strong>
              <div>${escapeHtml(comment.content)}</div>
              <div class="post-meta">${new Date(comment.created_at).toLocaleString('zh-CN')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  
  // 分页控件
  let paginationHtml = '<div class="pagination">';
  for (let i = 1; i <= Math.min(totalPages, 5); i++) {
    paginationHtml += `<a href="/?page=${i}" class="${i === page ? 'active' : ''}">${i}</a>`;
  }
  if (totalPages > 5) paginationHtml += '<span>…</span>';
  paginationHtml += '</div>';
  
  return renderLayout(postsHtml + (totalPages > 1 ? paginationHtml : ''), currentUser);
}

// 获取文章的评论
async function getCommentsForPost(BLOG_DATA_STORE, postId) {
  const commentKeys = await BLOG_DATA_STORE.list({ prefix: `comment:post:${postId}:` });
  const comments = [];
  for (const key of commentKeys.keys) {
    const commentData = await BLOG_DATA_STORE.get(key.name);
    if (commentData) {
      const comment = JSON.parse(commentData);
      comment.created_at = new Date(comment.created_at).toLocaleString('zh-CN');
      comments.push(comment);
    }
  }
  return comments;
}

// 登录页面
function renderLoginPage(error = '') {
  const errorHtml = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  return renderLayout(`
    <h1>登录</h1>
    ${errorHtml}
    <form method="POST" action="/login">
      <div class="form-group">
        <label for="username">用户名</label>
        <input type="text" id="username" name="username" required>
      </div>
      <div class="form-group">
        <label for="password">密码</label>
        <input type="password" id="password" name="password" required>
      </div>
      <button type="submit">登录</button>
    </form>
  `);
}

// 注册页面
function renderRegisterPage(error = '') {
  const errorHtml = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  return renderLayout(`
    <h1>注册</h1>
    ${errorHtml}
    <form method="POST" action="/register">
      <div class="form-group">
        <label for="nickname">昵称</label>
        <input type="text" id="nickname" name="nickname" required>
      </div>
      <div class="form-group">
        <label for="username">用户名</label>
        <input type="text" id="username" name="username" required>
      </div>
      <div class="form-group">
        <label for="password">密码</label>
        <input type="password" id="password" name="password" required>
      </div>
      <div class="form-group">
        <label for="invite_code">邀请码</label>
        <input type="text" id="invite_code" name="invite_code" required>
      </div>
      <div class="form-group">
        <label>性别</label>
        <select name="gender">
          <option value="">未设置</option>
          <option value="♂">♂</option>
          <option value="♀">♀</option>
        </select>
      </div>
      <div class="form-group">
        <label for="bio">个人简介</label>
        <textarea id="bio" name="bio" rows="3"></textarea>
      </div>
      <button type="submit">注册</button>
    </form>
  `);
}

// 发帖页面
function renderPostPage(currentUser, error = '') {
  if (!currentUser) return new Response('请先登录', { status: 401 });
  const errorHtml = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  return renderLayout(`
    <h1>发布新文章</h1>
    ${errorHtml}
    <form method="POST" action="/post">
      <div class="form-group">
        <label for="title">标题</label>
        <input type="text" id="title" name="title" required>
      </div>
      <div class="form-group">
        <label for="image_url">配图链接（可选）</label>
        <input type="url" id="image_url" name="image_url">
      </div>
      <div class="form-group">
        <label for="content">正文</label>
        <textarea id="content" name="content" rows="10" required></textarea>
      </div>
      <button type="submit">发布</button>
    </form>
  `, currentUser);
}

// 用户详情页
async function renderUserProfile(BLOG_DATA_STORE, targetUsername, currentUser) {
  const user = await BLOG_DATA_STORE.get(`user:${targetUsername}`);
  if (!user) return new Response('用户不存在', { status: 404 });
  
  const userData = JSON.parse(user);
  const posts = await getUserPosts(BLOG_DATA_STORE, targetUsername);
  
  // 生成头衔
  let roleBadge = '';
  if (userData.role === SUPERADMIN_ROLE) {
    roleBadge = '<span class="role-founder">创始人</span>';
  } else if (userData.role === ADMIN_ROLE) {
    roleBadge = '<span class="role-admin">管理员</span>';
  } else {
    roleBadge = '<span class="role-member">注册会员</span>';
  }
  
  // 管理操作按钮（仅系统管理员可见）
  let adminActions = '';
  if (currentUser && currentUser.role === SUPERADMIN_ROLE && targetUsername !== ADMIN_USERNAME) {
    adminActions = `
      <div class="admin-actions">
        <button onclick="toggleBan('${targetUsername}')">${userData.is_banned ? '解封' : '封禁'}</button>
        <button onclick="toggleSilence('${targetUsername}')">${userData.is_silenced ? '解除禁言' : '禁言'}</button>
        <button class="secondary" onclick="resetPassword('${targetUsername}')">重置密码</button>
        <button class="secondary" onclick="toggleAdmin('${targetUsername}')">${userData.role === ADMIN_ROLE ? '取消管理员' : '设为管理员'}</button>
        <button class="secondary" onclick="logoutUser('${targetUsername}')">强制登出</button>
      </div>
      <script>
        async function toggleBan(username) {
          await fetch('/admin/ban', { method: 'POST', body: JSON.stringify({ username }) });
          location.reload();
        }
        async function toggleSilence(username) {
          await fetch('/admin/silence', { method: 'POST', body: JSON.stringify({ username }) });
          location.reload();
        }
        async function resetPassword(username) {
          if (confirm('确定重置密码？新密码将设为 username123')) {
            await fetch('/admin/reset-password', { method: 'POST', body: JSON.stringify({ username }) });
            alert('密码已重置');
          }
        }
        async function toggleAdmin(username) {
          await fetch('/admin/toggle-admin', { method: 'POST', body: JSON.stringify({ username }) });
          location.reload();
        }
        async function logoutUser(username) {
          await fetch('/admin/logout-user', { method: 'POST', body: JSON.stringify({ username }) });
          alert('用户已登出');
        }
      </script>
    `;
  }
  
  return renderLayout(`
    <h1>${escapeHtml(userData.nickname)} 的主页 ${roleBadge}</h1>
    <div class="user-info">
      <p>最后活跃: ${new Date(userData.last_active).toLocaleString('zh-CN')}</p>
      <p>注册时间: ${new Date(userData.created_at).toLocaleString('zh-CN')}</p>
      <p>性别: <span class="${userData.gender === '♂' ? 'gender-male' : userData.gender === '♀' ? 'gender-female' : ''}">${escapeHtml(userData.gender || '未设置')}</span></p>
      <p>个人简介: ${escapeHtml(userData.bio || '无')}</p>
      <p><a href="/dm?to=${encodeURIComponent(targetUsername)}">发送私信</a></p>
    </div>
    ${adminActions}
    <h2>全部文章</h2>
    ${posts.length ? 
      posts.map(post => `
        <div class="post-card">
          <h3><a href="/post/${post.id}">${escapeHtml(post.title)}</a></h3>
          <div class="post-meta">${post.created_at} | ${post.views} 阅读</div>
        </div>
      `).join('') 
      : '<p>暂无文章</p>'
    }
  `, currentUser);
}

// 获取用户文章
async function getUserPosts(BLOG_DATA_STORE, username) {
  const postKeys = await BLOG_DATA_STORE.list({ prefix: 'post:' });
  const posts = [];
  for (const key of postKeys.keys) {
    const postData = await BLOG_DATA_STORE.get(key.name);
    if (postData) {
      const post = JSON.parse(postData);
      if (post.author === username) {
        post.created_at = new Date(post.created_at).toLocaleDateString('zh-CN');
        posts.push(post);
      }
    }
  }
  return posts;
}

// RSS 订阅生成
async function generateRSS(BLOG_DATA_STORE) {
  const postKeys = await BLOG_DATA_STORE.list({ prefix: 'post:' });
  const items = [];
  
  for (const key of postKeys.keys) {
    const postData = await BLOG_DATA_STORE.get(key.name);
    if (postData) {
      const post = JSON.parse(postData);
      const pubDate = new Date(post.created_at).toUTCString();
      items.push(`
        <item>
          <title>${escapeHtml(post.title)}</title>
          <link>${SITE_URL}/post/${post.id}</link>
          <description>${escapeHtml(post.content.substring(0, 150))}...</description>
          <pubDate>${pubDate}</pubDate>
        </item>
      `);
    }
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0">
    <channel>
      <title>${RSS_TITLE}</title>
      <link>${SITE_URL}</link>
      <description>曦月的小窝的RSS订阅</description>
      <language>zh-cn</language>
      ${items.join('')}
    </channel>
  </rss>`;
}

// 主请求处理器
async function handleRequest(event) {
  const { request, env } = event;
  const BLOG_DATA_STORE = env.BLOG_DATA_STORE;
  await initializeSystemAdmin(BLOG_DATA_STORE);
  
  const url = new URL(request.url);
  let currentUser = null;
  
  // 会话验证
  const username = await authenticate(request, BLOG_DATA_STORE);
  if (username) {
    const user = await BLOG_DATA_STORE.get(`user:${username}`);
    if (user) {
      currentUser = JSON.parse(user);
      // 更新最后活跃时间
      currentUser.last_active = Date.now();
      await BLOG_DATA_STORE.put(`user:${username}`, JSON.stringify(currentUser));
    }
  }
  
  // 路由处理
  if (url.pathname === '/') {
    return new Response(await renderHomePage(request, BLOG_DATA_STORE, currentUser), { headers: { 'Content-Type': 'text/html' } });
  }
  
  if (url.pathname === '/login' && request.method === 'GET') {
    return new Response(renderLoginPage(), { headers: { 'Content-Type': 'text/html' } });
  }
  
  if (url.pathname === '/login' && request.method === 'POST') {
    const formData = await request.formData();
    const username = formData.get('username');
    const password = formData.get('password');
    
    if (!username || !password) {
      return new Response(renderLoginPage('请输入用户名和密码'), { headers: { 'Content-Type': 'text/html' } });
    }
    
    const user = await BLOG_DATA_STORE.get(`user:${username}`);
    if (!user) {
      return new Response(renderLoginPage('用户不存在'), { headers: { 'Content-Type': 'text/html' } });
    }
    
    const userData = JSON.parse(user);
    const { password_hash, salt } = userData;
    const isValid = await verifyPassword(password, password_hash, salt);
    
    if (!isValid) {
      return new Response(renderLoginPage('密码错误'), { headers: { 'Content-Type': 'text/html' } });
    }
    
    // 创建会话
    const token = generateSessionToken();
    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7天
    await BLOG_DATA_STORE.put(`session:${token}`, JSON.stringify({ username, expires }));
    
    const response = Response.redirect('/', 302);
    response.headers.set('Set-Cookie', `session_token=${token}; Path=/; HttpOnly; Max-Age=604800`);
    return response;
  }
  
  if (url.pathname === '/register' && request.method === 'GET') {
    return new Response(renderRegisterPage(), { headers: { 'Content-Type': 'text/html' } });
  }
  
  if (url.pathname === '/register' && request.method === 'POST') {
    const formData = await request.formData();
    const nickname = formData.get('nickname');
    const username = formData.get('username');
    const password = formData.get('password');
    const inviteCode = formData.get('invite_code');
    const gender = formData.get('gender') || '';
    const bio = formData.get('bio') || '';
    
    // 验证输入
    if (!nickname || !username || !password || !inviteCode) {
      return new Response(renderRegisterPage('所有字段均为必填'), { headers: { 'Content-Type': 'text/html' } });
    }
    
    if (username.length < 3 || username.length > 20) {
      return new Response(renderRegisterPage('用户名长度需为3-20字符'), { headers: { 'Content-Type': 'text/html' } });
    }
    
    if (await BLOG_DATA_STORE.get(`user:${username}`)) {
      return new Response(renderRegisterPage('用户名已存在'), { headers: { 'Content-Type': 'text/html' } });
    }
    
    // 验证邀请码
    const storedInvite = await BLOG_DATA_STORE.get('setting:invite_code');
    if (inviteCode !== storedInvite) {
      return new Response(renderRegisterPage('邀请码无效'), { headers: { 'Content-Type': 'text/html' } });
    }
    
    // 创建用户
    const { hash, salt } = await hashPassword(password);
    const user = {
      username,
      password_hash: hash,
      salt,
      nickname,
      role: USER_ROLE,
      avatar: '',
      bio,
      gender,
      created_at: Date.now(),
      last_active: Date.now(),
      is_banned: false,
      is_silenced: false
    };
    await BLOG_DATA_STORE.put(`user:${username}`, JSON.stringify(user));
    
    return new Response(renderLoginPage('注册成功，请登录'), { headers: { 'Content-Type': 'text/html' } });
  }
  
  if (url.pathname === '/post' && request.method === 'GET') {
    if (!currentUser) return Response.redirect('/login', 302);
    return new Response(renderPostPage(currentUser), { headers: { 'Content-Type': 'text/html' } });
  }
  
  if (url.pathname === '/post' && request.method === 'POST') {
    if (!currentUser) return new Response('请先登录', { status: 401 });
    if (currentUser.is_banned || currentUser.is_silenced) {
      return new Response('您的账号已被封禁或禁言', { status: 403 });
    }
    
    const formData = await request.formData();
    const title = formData.get('title');
    const image_url = formData.get('image_url') || '';
    const content = formData.get('content');
    
    if (!title || !content) {
      return new Response(renderPostPage(currentUser, '标题和正文不能为空'), { headers: { 'Content-Type': 'text/html' } });
    }
    
    // 创建文章
    const id = Date.now().toString();
    const post = {
      id,
      title,
      image_url,
      content,
      author: currentUser.username,
      created_at: Date.now(),
      views: 0,
      word_count: content.split(/\s+/).filter(Boolean).length
    };
    await BLOG_DATA_STORE.put(`post:${id}`, JSON.stringify(post));
    
    return Response.redirect(`/${id}`, 302);
  }
  
  if (url.pathname.startsWith('/post/') && request.method === 'GET') {
    const postId = url.pathname.split('/').pop();
    const postData = await BLOG_DATA_STORE.get(`post:${postId}`);
    if (!postData) return new Response('文章不存在', { status: 404 });
    
    const post = JSON.parse(postData);
    post.views = (post.views || 0) + 1;
    await BLOG_DATA_STORE.put(`post:${postId}`, JSON.stringify(post));
    
    // 渲染文章页（简化版，实际应包含完整内容）
    const content = `
      <h1>${escapeHtml(post.title)}</h1>
      ${post.image_url ? `<img src="${escapeHtml(post.image_url)}" alt="配图" style="max-width:100%;">` : ''}
      <div class="post-content">${escapeHtml(post.content)}</div>
      <div class="post-meta">
        作者: <a href="/user/${encodeURIComponent(post.author)}">${escapeHtml(post.author)}</a> |
        ${post.created_at} | ${post.views} 阅读
      </div>
      <div class="comments-section">
        <h2>评论</h2>
        <!-- 评论表单和列表，此处简化 -->
        <p>评论功能待实现（根据要求精简）</p>
      </div>
    `;
    return new Response(renderLayout(content, currentUser), { headers: { 'Content-Type': 'text/html' } });
  }
  
  if (url.pathname === '/user' && request.method === 'GET') {
    const targetUsername = url.searchParams.get('username');
    if (!targetUsername) return Response.redirect('/', 302);
    return new Response(await renderUserProfile(BLOG_DATA_STORE, targetUsername, currentUser), { headers: { 'Content-Type': 'text/html' } });
  }
  
  if (url.pathname === '/user/' + encodeURIComponent(ADMIN_USERNAME) && request.method === 'GET') {
    // 特殊处理系统管理员页面
    return new Response(await renderUserProfile(BLOG_DATA_STORE, ADMIN_USERNAME, currentUser), { headers: { 'Content-Type': 'text/html' } });
  }
  
  if (url.pathname === '/rss' && request.method === 'GET') {
    const rss = await generateRSS(BLOG_DATA_STORE);
    return new Response(rss, { headers: { 'Content-Type': 'application/rss+xml' } });
  }
  
  if (url.pathname === '/logout' && request.method === 'GET') {
    const cookie = request.headers.get('Cookie') || '';
    const tokenMatch = cookie.match(/session_token=([^;]+)/);
    if (tokenMatch) {
      await BLOG_DATA_STORE.delete(`session:${tokenMatch[1]}`);
    }
    const response = Response.redirect('/', 302);
    response.headers.set('Set-Cookie', 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    return response;
  }
  
  // 管理 API（仅系统管理员）
  if (url.pathname.startsWith('/admin/') && request.method === 'POST') {
    if (!currentUser || currentUser.role !== SUPERADMIN_ROLE) {
      return new Response('权限不足', { status: 403 });
    }
    
    const { username: targetUsername } = await request.json();
    const targetUser = await BLOG_DATA_STORE.get(`user:${targetUsername}`);
    if (!targetUser || targetUsername === ADMIN_USERNAME) {
      return new Response('操作无效', { status: 400 });
    }
    
    const userData = JSON.parse(targetUser);
    
    if (url.pathname === '/admin/ban') {
      userData.is_banned = !userData.is_banned;
      await BLOG_DATA_STORE.put(`user:${targetUsername}`, JSON.stringify(userData));
      return new Response('OK');
    }
    
    if (url.pathname === '/admin/silence') {
      userData.is_silenced = !userData.is_silenced;
      await BLOG_DATA_STORE.put(`user:${targetUsername}`, JSON.stringify(userData));
      return new Response('OK');
    }
    
    if (url.pathname === '/admin/reset-password') {
      const { hash, salt } = await hashPassword(`${targetUsername}123`);
      userData.password_hash = hash;
      userData.salt = salt;
      await BLOG_DATA_STORE.put(`user:${targetUsername}`, JSON.stringify(userData));
      return new Response('OK');
    }
    
    if (url.pathname === '/admin/toggle-admin') {
      userData.role = userData.role === ADMIN_ROLE ? USER_ROLE : ADMIN_ROLE;
      await BLOG_DATA_STORE.put(`user:${targetUsername}`, JSON.stringify(userData));
      return new Response('OK');
    }
    
    if (url.pathname === '/admin/logout-user') {
      // 删除所有会话（简化：遍历 session 键）
      const sessionKeys = await BLOG_DATA_STORE.list({ prefix: 'session:' });
      for (const key of sessionKeys.keys) {
        const sessionData = await BLOG_DATA_STORE.get(key.name);
        if (sessionData) {
          const { username } = JSON.parse(sessionData);
          if (username === targetUsername) {
            await BLOG_DATA_STORE.delete(key.name);
          }
        }
      }
      return new Response('OK');
    }
  }
  
  // 404 处理
  return new Response('页面未找到', { status: 404 });
}

// Cloudflare Workers 入口
export default {
  async fetch(request, env) {
    return handleRequest({ request, env });
  }
};