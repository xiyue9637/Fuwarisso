// worker.js
// 修复聊天功能并添加聊天按钮
const ADMIN_USERNAME = 'xiyue';
const ADMIN_PASSWORD = 'xiyue777';
const ADMIN_NICKNAME = '曦月';
const BAN_MESSAGE = ' 您的账号已被管理员封禁 , 请联系  linyi8100@gmail.com  解封 ';
const INVITE_CODE = 'xiyue666'; // 邀请码

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function simpleSha256(str) {
  try {
    let hash = 0;
    if (str.length === 0) return '0';
    for (let i = 0; i < str.length; i++) {
      const chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash = hash & hash;
    }
    return hash.toString(16);
  } catch (e) {
    console.error('SHA-256 error:', e);
    return 'error_hash';
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonResponse(data, status = 200) {
  try {
    return new Response(JSON.stringify(data), {
      status: status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
      }
    });
  } catch (e) {
    console.error('JSON response error:', e);
    return new Response(JSON.stringify({ 
      error: ' 服务器内部错误 ', 
      details: ' 无法生成响应 ' 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

function handleOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}

async function initAdmin(env) {
  try {
    const adminKey = `users/${ADMIN_USERNAME}`;
    const existing = await env.BLOG_KV.get(adminKey);
    if (!existing) {
      const passwordHash = simpleSha256(ADMIN_PASSWORD);
      await env.BLOG_KV.put(adminKey, JSON.stringify({
        username: ADMIN_USERNAME,
        passwordHash,
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=xiyue',
        nickname: ADMIN_NICKNAME,
        banned: false,
        role: 'founder',
        title: '创始人',
        createdAt: new Date().toISOString()
      }));
      console.log('创始人账户已创建');
    }
  } catch (e) {
    console.error('初始化创始人失败:', e);
  }
}

async function verifyUser(env, username, password) {
  try {
    const userKey = `users/${username}`;
    const userData = await env.BLOG_KV.get(userKey);
    if (!userData) return null;
    let user;
    try {
      user = JSON.parse(userData);
    } catch (e) {
      console.error('解析用户数据失败:', e);
      return null;
    }
    const expectedHash = simpleSha256(password);
    if (user.passwordHash === expectedHash && !user.banned) {
      return {
        username: user.username || username,
        nickname: user.nickname || username,
        role: user.role || 'user',
        title: user.title || '注册会员',
        avatar: user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
        createdAt: user.createdAt
      };
    }
    return null;
  } catch (e) {
    console.error('验证用户时出错:', e);
    return null;
  }
}

function verifyToken(token, secret) {
  try {
    if (!token || !secret) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [header, payload, signature] = parts;
    const expectedSignature = simpleSha256(header + payload + secret);
    return signature === expectedSignature;
  } catch (e) {
    console.error('验证令牌时出错:', e);
    return false;
  }
}

function decodeToken(token) {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch (e) {
    console.error('解码令牌时出错:', e);
    return null;
  }
}

async function checkPermission(env, request, requiredRole = 'user') {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return { valid: false, error: '未提供令牌' };
    if (!env.SECRET_KEY) {
      console.error('SECRET_KEY 未设置');
      return { valid: false, error: '服务器配置错误' };
    }
    if (!verifyToken(token, env.SECRET_KEY)) {
      return { valid: false, error: '无效或过期的令牌' };
    }
    const payload = decodeToken(token);
    if (!payload || !payload.username) {
      return { valid: false, error: '无效的令牌格式' };
    }
    const userKey = `users/${payload.username}`;
    const userData = await env.BLOG_KV.get(userKey);
    if (!userData) {
      return { valid: false, error: '用户不存在' };
    }
    let user;
    try {
      user = JSON.parse(userData);
    } catch (e) {
      console.error('解析用户数据失败:', e);
      return { valid: false, error: '用户数据损坏' };
    }
    if (user.banned) {
      return { valid: false, error: BAN_MESSAGE };
    }
    const rolePriority = {
      'founder': 3,
      'admin': 2,
      'moderator': 1,
      'user': 0
    };
    if (rolePriority[user.role] < rolePriority[requiredRole]) {
      return { valid: false, error: '权限不足' };
    }
    if (user.role === 'founder' && payload.username === ADMIN_USERNAME && requiredRole !== 'founder') {
      return { valid: false, error: '创始人账号不可操作' };
    }
    return { 
      valid: true, 
      user: {
        username: payload.username,
        nickname: user.nickname || payload.username,
        role: user.role || 'user',
        title: user.title || '注册会员',
        avatar: user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
        createdAt: user.createdAt
      }
    };
  } catch (e) {
    console.error('检查权限时出错:', e);
    return { valid: false, error: '权限验证失败' };
  }
}

export default {
  async fetch(request, env) {
    try {
      if (!env.SECRET_KEY) {
        console.error('环境变量 SECRET_KEY 未设置');
        return safeJsonResponse({ 
          error: '服务器配置错误', 
          details: 'SECRET_KEY 未设置' 
        }, 500);
      }
      try {
        await initAdmin(env);
      } catch (e) {
        console.error('初始化管理员时出错:', e);
      }
      const url = new URL(request.url);
      const pathname = url.pathname;
      if (request.method === 'OPTIONS') {
        return handleOptions();
      }
      if (pathname === '/') {
        return new Response(indexHTML, {
          headers: { 
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      if (pathname.startsWith('/api/')) {
        try {
          if (pathname === '/api/register' && request.method === 'POST') {
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { username, password, avatar, inviteCode, nickname, gender, bio } = data;
            if (inviteCode !== INVITE_CODE) {
              return safeJsonResponse({ error: '邀请码不正确' }, 403);
            }
            if (!username || !password) {
              return safeJsonResponse({ error: '用户名和密码是必填项' }, 400);
            }
            if (username.length < 3 || username.length > 20) {
              return safeJsonResponse({ error: '用户名长度必须在 3-20 个字符之间' }, 400);
            }
            if (password.length < 6) {
              return safeJsonResponse({ error: '密码至少需要 6 个字符' }, 400);
            }
            try {
              const existing = await env.BLOG_KV.get(`users/${username}`);
              if (existing) {
                return safeJsonResponse({ error: '用户名已存在' }, 400);
              }
            } catch (e) {
              console.error('检查用户名时出错:', e);
              return safeJsonResponse({ error: '服务器错误' }, 500);
            }
            try {
              const passwordHash = simpleSha256(password);
              await env.BLOG_KV.put(`users/${username}`, JSON.stringify({
                username,
                passwordHash,
                avatar: avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',
                nickname: nickname || username,
                gender: gender || 'unknown',
                bio: bio || '',
                banned: false,
                muted: false,
                role: 'user',
                title: '注册会员',
                createdAt: new Date().toISOString(),
                lastActive: new Date().toISOString()
              }));
              return safeJsonResponse({ success: true });
            } catch (e) {
              console.error('创建用户时出错:', e);
              return safeJsonResponse({ error: '无法创建用户' }, 500);
            }
          }
          if (pathname === '/api/login' && request.method === 'POST') {
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { username, password } = data;
            if (!username || !password) {
              return safeJsonResponse({ error: '用户名和密码是必填项' }, 400);
            }
            const user = await verifyUser(env, username, password);
            if (!user) {
              return safeJsonResponse({ error: '用户名或密码错误' }, 401);
            }
            try {
              const payload = {
                username: user.username,
                role: user.role,
                exp: Date.now() + 86400000
              };
              const header = btoa(JSON.stringify({ alg: 'HS256' }));
              const payloadStr = btoa(JSON.stringify(payload));
              const signature = simpleSha256(header + payloadStr + env.SECRET_KEY);
              return safeJsonResponse({
                token: `${header}.${payloadStr}.${signature}`,
                username: user.username,
                nickname: user.nickname,
                role: user.role,
                title: user.title,
                avatar: user.avatar,
                createdAt: user.createdAt
              });
            } catch (e) {
              console.error('生成令牌时出错:', e);
              return safeJsonResponse({ error: '无法生成令牌' }, 500);
            }
          }
          if (pathname.startsWith('/api/users/') && request.method === 'GET') {
            const username = pathname.split('/').pop();
            const userKey = `users/${username}`;
            const userData = await env.BLOG_KV.get(userKey);
            if (!userData) {
              return safeJsonResponse({ error: '用户不存在' }, 404);
            }
            let user;
            try {
              user = JSON.parse(userData);
            } catch (e) {
              console.error('解析用户数据失败:', e);
              return safeJsonResponse({ error: '用户数据损坏' }, 500);
            }
            return safeJsonResponse({
              username: user.username,
              nickname: user.nickname,
              avatar: user.avatar,
              role: user.role,
              title: user.title,
              createdAt: user.createdAt,
              lastActive: user.lastActive,
              gender: user.gender,
              bio: user.bio,
              banned: user.banned,
              muted: user.muted
            });
          }
          if (pathname.startsWith('/api/users/') && pathname.endsWith('/profile') && request.method === 'PUT') {
            const { valid, error, user: currentUser } = await checkPermission(env, request);
            if (!valid) return safeJsonResponse({ error }, 403);
            const username = pathname.split('/')[3];
            if (currentUser.username !== username) {
              return safeJsonResponse({ error: '无权修改他人信息' }, 403);
            }
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const userKey = `users/${username}`;
            const userData = await env.BLOG_KV.get(userKey);
            if (!userData) {
              return safeJsonResponse({ error: '用户不存在' }, 404);
            }
            let user;
            try {
              user = JSON.parse(userData);
            } catch (e) {
              console.error('解析用户数据失败:', e);
              return safeJsonResponse({ error: '用户数据损坏' }, 500);
            }
            if (data.nickname) user.nickname = data.nickname;
            if (data.avatar) user.avatar = data.avatar;
            if (data.bio) user.bio = data.bio;
            if (data.gender) user.gender = data.gender;
            if (data.currentPassword && data.newPassword) {
              const currentPasswordHash = simpleSha256(data.currentPassword);
              if (user.passwordHash !== currentPasswordHash) {
                return safeJsonResponse({ error: '当前密码错误' }, 400);
              }
              if (data.newPassword.length < 6) {
                return safeJsonResponse({ error: '新密码至少需要 6 个字符' }, 400);
              }
              user.passwordHash = simpleSha256(data.newPassword);
            }
            user.lastActive = new Date().toISOString();
            await env.BLOG_KV.put(userKey, JSON.stringify(user));
            return safeJsonResponse({ success: true });
          }
          if (pathname === '/api/posts' && request.method === 'GET') {
            try {
              const list = await env.BLOG_KV.list({ prefix: 'posts/' });
              const posts = [];
              for (const key of list.keys) {
                try {
                  const post = await env.BLOG_KV.get(key.name, 'json');
                  if (post) posts.push(post);
                } catch (e) {
                  console.error('获取帖子时出错:', e, key.name);
                }
              }
              posts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
              return safeJsonResponse(posts);
            } catch (e) {
              console.error('获取帖子列表时出错:', e);
              return safeJsonResponse({ error: '无法获取帖子' }, 500);
            }
          }
          if (pathname === '/api/posts' && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request);
            if (!valid) return safeJsonResponse({ error }, 403);
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { title, content, type, image } = data;
            if (!title || !content) {
              return safeJsonResponse({ error: '标题和内容不能为空' }, 400);
            }
            try {
              const postId = generateUUID();
              const wordCount = content.trim().split(/\s+/).length;
              await env.BLOG_KV.put(`posts/${postId}`, JSON.stringify({
                id: postId,
                title,
                content,
                type,
                image: image || '',
                author: user.username,
                nickname: user.nickname,
                title: user.title,
                avatar: user.avatar,
                createdAt: new Date().toISOString(),
                views: 0,
                wordCount: wordCount,
                likes: 0
              }));
              return safeJsonResponse({ postId });
            } catch (e) {
              console.error('创建帖子时出错:', e);
              return safeJsonResponse({ error: '无法发布帖子' }, 500);
            }
          }
          if (pathname.startsWith('/api/posts/') && !pathname.includes('/comments') && request.method === 'GET') {
            const postId = pathname.split('/').pop();
            try {
              const post = await env.BLOG_KV.get(`posts/${postId}`, 'json');
              if (!post) {
                return safeJsonResponse({ error: '帖子不存在' }, 404);
              }
              post.views = (post.views || 0) + 1;
              await env.BLOG_KV.put(`posts/${postId}`, JSON.stringify(post));
              return safeJsonResponse(post);
            } catch (e) {
              console.error('获取帖子时出错:', e);
              return safeJsonResponse({ error: '无法获取帖子' }, 500);
            }
          }
          if (pathname.startsWith('/api/posts/') && request.method === 'DELETE') {
            const { valid, error, user } = await checkPermission(env, request, 'admin');
            if (!valid) return safeJsonResponse({ error }, 403);
            const postId = pathname.split('/').pop();
            try {
              await env.BLOG_KV.delete(`posts/${postId}`);
              const commentKeys = await env.BLOG_KV.list({ prefix: `comments/${postId}/` });
              if (commentKeys.keys.length > 0) {
                await Promise.all(commentKeys.keys.map(k => 
                  env.BLOG_KV.delete(k.name).catch(e => {
                    console.error('删除评论时出错:', e, k.name);
                  })
                ));
              }
              return safeJsonResponse({ success: true });
            } catch (e) {
              console.error('删除帖子时出错:', e);
              return safeJsonResponse({ error: '无法删除帖子' }, 500);
            }
          }
          if (pathname.startsWith('/api/posts/') && pathname.endsWith('/comments') && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request);
            if (!valid) return safeJsonResponse({ error }, 403);
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { content } = data;
            if (!content || content.trim() === '') {
              return safeJsonResponse({ error: '评论内容不能为空' }, 400);
            }
            const postId = pathname.split('/')[3];
            try {
              const commentId = generateUUID();
              await env.BLOG_KV.put(`comments/${postId}/${commentId}`, JSON.stringify({
                id: commentId,
                content,
                author: user.username,
                nickname: user.nickname,
                title: user.title,
                avatar: user.avatar,
                createdAt: new Date().toISOString()
              }));
              return safeJsonResponse({ commentId });
            } catch (e) {
              console.error('创建评论时出错:', e);
              return safeJsonResponse({ error: '无法发布评论' }, 500);
            }
          }
          if (pathname.startsWith('/api/posts/') && pathname.endsWith('/comments') && request.method === 'GET') {
            const postId = pathname.split('/')[3];
            try {
              const list = await env.BLOG_KV.list({ prefix: `comments/${postId}/` });
              const comments = [];
              for (const key of list.keys) {
                try {
                  const comment = await env.BLOG_KV.get(key.name, 'json');
                  if (comment) comments.push(comment);
                } catch (e) {
                  console.error('获取评论时出错:', e, key.name);
                }
              }
              comments.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
              return safeJsonResponse(comments);
            } catch (e) {
              console.error('获取评论列表时出错:', e);
              return safeJsonResponse({ error: '无法获取评论' }, 500);
            }
          }
          if ((pathname.startsWith('/api/comments/') || 
            (pathname.startsWith('/api/posts/') && pathname.includes('/comments/'))) && 
            request.method === 'DELETE') {
            const { valid, error, user } = await checkPermission(env, request);
            if (!valid) return safeJsonResponse({ error }, 403);
            let postId, commentId;
            if (pathname.startsWith('/api/comments/')) {
              const parts = pathname.split('/');
              if (parts.length >= 5) {
                postId = parts[3];
                commentId = parts[4];
              }
            } else if (pathname.includes('/comments/')) {
              const parts = pathname.split('/');
              const commentIndex = parts.indexOf('comments');
              if (commentIndex > 0 && commentIndex < parts.length - 1) {
                postId = parts[commentIndex - 1];
                commentId = parts[commentIndex + 1];
              }
            }
            if (!postId || !commentId) {
              return safeJsonResponse({ error: '无效的评论 ID' }, 400);
            }
            try {
              const comment = await env.BLOG_KV.get(`comments/${postId}/${commentId}`, 'json');
              if (!comment) {
                return safeJsonResponse({ error: '评论不存在' }, 404);
              }
              if (user.role !== 'admin' && comment.author !== user.username) {
                return safeJsonResponse({ error: '无权删除此评论' }, 403);
              }
              await env.BLOG_KV.delete(`comments/${postId}/${commentId}`);
              return safeJsonResponse({ success: true });
            } catch (e) {
              console.error('删除评论时出错:', e);
              return safeJsonResponse({ error: '无法删除评论' }, 500);
            }
          }
          if (pathname.startsWith('/api/posts/') && pathname.endsWith('/like') && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request);
            if (!valid) return safeJsonResponse({ error }, 403);
            const postId = pathname.split('/')[3];
            try {
              const post = await env.BLOG_KV.get(`posts/${postId}`, 'json');
              if (!post) {
                return safeJsonResponse({ error: '帖子不存在' }, 404);
              }
              const likedKey = `likes/${postId}/${user.username}`;
              const alreadyLiked = await env.BLOG_KV.get(likedKey);
              if (alreadyLiked) {
                post.likes = Math.max(0, (post.likes || 0) - 1);
                await env.BLOG_KV.delete(likedKey);
              } else {
                post.likes = (post.likes || 0) + 1;
                await env.BLOG_KV.put(likedKey, 'true');
              }
              await env.BLOG_KV.put(`posts/${postId}`, JSON.stringify(post));
              return safeJsonResponse({ likes: post.likes });
            } catch (e) {
              console.error('点赞操作失败:', e);
              return safeJsonResponse({ error: '点赞操作失败' }, 500);
            }
          }
          if (pathname === '/api/ban' && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request, 'admin');
            if (!valid) return safeJsonResponse({ error }, 403);
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { username } = data;
            if (!username) {
              return safeJsonResponse({ error: '需要提供用户名' }, 400);
            }
            if (username === ADMIN_USERNAME) {
              return safeJsonResponse({ error: '不能封禁创始人' }, 400);
            }
            try {
              const userKey = `users/${username}`;
              const userData = await env.BLOG_KV.get(userKey);
              if (!userData) {
                return safeJsonResponse({ error: '用户不存在' }, 404);
              }
              let userObj;
              try {
                userObj = JSON.parse(userData);
              } catch (e) {
                console.error('解析用户数据失败:', e);
                return safeJsonResponse({ error: '用户数据损坏' }, 500);
              }
              userObj.banned = true;
              await env.BLOG_KV.put(userKey, JSON.stringify(userObj));
              return safeJsonResponse({ 
                success: true,
                user: {
                  username: username,
                  banned: true
                }
              });
            } catch (e) {
              console.error('封禁用户时出错:', e);
              return safeJsonResponse({ error: '无法封禁用户' }, 500);
            }
          }
          if (pathname === '/api/unban' && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request, 'admin');
            if (!valid) return safeJsonResponse({ error }, 403);
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { username } = data;
            if (!username) {
              return safeJsonResponse({ error: '需要提供用户名' }, 400);
            }
            try {
              const userKey = `users/${username}`;
              const userData = await env.BLOG_KV.get(userKey);
              if (!userData) {
                return safeJsonResponse({ error: '用户不存在' }, 404);
              }
              let userObj;
              try {
                userObj = JSON.parse(userData);
              } catch (e) {
                console.error('解析用户数据失败:', e);
                return safeJsonResponse({ error: '用户数据损坏' }, 500);
              }
              userObj.banned = false;
              await env.BLOG_KV.put(userKey, JSON.stringify(userObj));
              return safeJsonResponse({ 
                success: true,
                user: {
                  username: username,
                  banned: false
                }
              });
            } catch (e) {
              console.error('解封用户时出错:', e);
              return safeJsonResponse({ error: '无法解封用户' }, 500);
            }
          }
          if (pathname === '/api/mute' && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request, 'admin');
            if (!valid) return safeJsonResponse({ error }, 403);
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { username } = data;
            if (!username) {
              return safeJsonResponse({ error: '需要提供用户名' }, 400);
            }
            if (username === ADMIN_USERNAME) {
              return safeJsonResponse({ error: '不能禁言创始人' }, 400);
            }
            try {
              const userKey = `users/${username}`;
              const userData = await env.BLOG_KV.get(userKey);
              if (!userData) {
                return safeJsonResponse({ error: '用户不存在' }, 404);
              }
              let userObj;
              try {
                userObj = JSON.parse(userData);
              } catch (e) {
                console.error('解析用户数据失败:', e);
                return safeJsonResponse({ error: '用户数据损坏' }, 500);
              }
              userObj.muted = true;
              await env.BLOG_KV.put(userKey, JSON.stringify(userObj));
              return safeJsonResponse({ 
                success: true,
                user: {
                  username: username,
                  muted: true
                }
              });
            } catch (e) {
              console.error('禁言用户时出错:', e);
              return safeJsonResponse({ error: '无法禁言用户' }, 500);
            }
          }
          if (pathname === '/api/unmute' && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request, 'admin');
            if (!valid) return safeJsonResponse({ error }, 403);
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { username } = data;
            if (!username) {
              return safeJsonResponse({ error: '需要提供用户名' }, 400);
            }
            try {
              const userKey = `users/${username}`;
              const userData = await env.BLOG_KV.get(userKey);
              if (!userData) {
                return safeJsonResponse({ error: '用户不存在' }, 404);
              }
              let userObj;
              try {
                userObj = JSON.parse(userData);
              } catch (e) {
                console.error('解析用户数据失败:', e);
                return safeJsonResponse({ error: '用户数据损坏' }, 500);
              }
              userObj.muted = false;
              await env.BLOG_KV.put(userKey, JSON.stringify(userObj));
              return safeJsonResponse({ 
                success: true,
                user: {
                  username: username,
                  muted: false
                }
              });
            } catch (e) {
              console.error('解除禁言时出错:', e);
              return safeJsonResponse({ error: '无法解除禁言' }, 500);
            }
          }
          if (pathname === '/api/promote' && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request, 'admin');
            if (!valid) return safeJsonResponse({ error }, 403);
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { username } = data;
            if (!username) {
              return safeJsonResponse({ error: '需要提供用户名' }, 400);
            }
            if (username === ADMIN_USERNAME) {
              return safeJsonResponse({ error: '不能修改创始人角色' }, 400);
            }
            try {
              const userKey = `users/${username}`;
              const userData = await env.BLOG_KV.get(userKey);
              if (!userData) {
                return safeJsonResponse({ error: '用户不存在' }, 404);
              }
              let userObj;
              try {
                userObj = JSON.parse(userData);
              } catch (e) {
                console.error('解析用户数据失败:', e);
                return safeJsonResponse({ error: '用户数据损坏' }, 500);
              }
              userObj.role = 'admin';
              await env.BLOG_KV.put(userKey, JSON.stringify(userObj));
              return safeJsonResponse({ 
                success: true,
                user: {
                  username: username,
                  role: 'admin'
                }
              });
            } catch (e) {
              console.error('提升用户权限时出错:', e);
              return safeJsonResponse({ error: '无法提升用户权限' }, 500);
            }
          }
          if (pathname === '/api/demote' && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request, 'admin');
            if (!valid) return safeJsonResponse({ error }, 403);
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { username } = data;
            if (!username) {
              return safeJsonResponse({ error: '需要提供用户名' }, 400);
            }
            if (username === ADMIN_USERNAME) {
              return safeJsonResponse({ error: '不能修改创始人角色' }, 400);
            }
            try {
              const userKey = `users/${username}`;
              const userData = await env.BLOG_KV.get(userKey);
              if (!userData) {
                return safeJsonResponse({ error: '用户不存在' }, 404);
              }
              let userObj;
              try {
                userObj = JSON.parse(userData);
              } catch (e) {
                console.error('解析用户数据失败:', e);
                return safeJsonResponse({ error: '用户数据损坏' }, 500);
              }
              userObj.role = 'user';
              await env.BLOG_KV.put(userKey, JSON.stringify(userObj));
              return safeJsonResponse({ 
                success: true,
                user: {
                  username: username,
                  role: 'user'
                }
              });
            } catch (e) {
              console.error('降级用户权限时出错:', e);
              return safeJsonResponse({ error: '无法降级用户权限' }, 500);
            }
          }
          if (pathname === '/api/reset-password' && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request, 'admin');
            if (!valid) return safeJsonResponse({ error }, 403);
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { username, newPassword } = data;
            if (!username || !newPassword) {
              return safeJsonResponse({ error: '需要提供用户名和新密码' }, 400);
            }
            if (username === ADMIN_USERNAME) {
              return safeJsonResponse({ error: '不能重置创始人密码' }, 400);
            }
            if (newPassword.length < 6) {
              return safeJsonResponse({ error: '新密码至少需要 6 个字符' }, 400);
            }
            try {
              const userKey = `users/${username}`;
              const userData = await env.BLOG_KV.get(userKey);
              if (!userData) {
                return safeJsonResponse({ error: '用户不存在' }, 404);
              }
              let userObj;
              try {
                userObj = JSON.parse(userData);
              } catch (e) {
                console.error('解析用户数据失败:', e);
                return safeJsonResponse({ error: '用户数据损坏' }, 500);
              }
              userObj.passwordHash = simpleSha256(newPassword);
              await env.BLOG_KV.put(userKey, JSON.stringify(userObj));
              return safeJsonResponse({ 
                success: true,
                message: '密码已重置'
              });
            } catch (e) {
              console.error('重置密码时出错:', e);
              return safeJsonResponse({ error: '无法重置密码' }, 500);
            }
          }
          if (pathname === '/api/logout' && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request);
            if (!valid) return safeJsonResponse({ error }, 403);
            return safeJsonResponse({ success: true });
          }
          if (pathname === '/api/invite-code' && request.method === 'POST') {
            const { valid, error, user } = await checkPermission(env, request, 'admin');
            if (!valid) return safeJsonResponse({ error }, 403);
            let data;
            try {
              data = await request.json();
            } catch (e) {
              return safeJsonResponse({ error: '无效的 JSON 数据' }, 400);
            }
            const { newInviteCode } = data;
            if (!newInviteCode || newInviteCode.length < 4) {
              return safeJsonResponse({ error: '邀请码必须至少 4 个字符' }, 400);
            }
            INVITE_CODE = newInviteCode;
            return safeJsonResponse({ 
              success: true,
              message: '邀请码已更新'
            });
          }
          if (pathname === '/api/search' && request.method === 'GET') {
            const query = url.searchParams.get('q');
            if (!query || query.length < 2) {
              return safeJsonResponse({ error: '搜索关键词太短' }, 400);
            }
            try {
              const list = await env.BLOG_KV.list({ prefix: 'posts/' });
              const posts = [];
              for (const key of list.keys) {
                const post = await env.BLOG_KV.get(key.name, 'json');
                if (post && (post.title.includes(query) || post.content.includes(query))) {
                  posts.push(post);
                }
              }
              posts.sort((a, b) => {
                const aScore = (a.title.includes(query) ? 2 : 0) + (a.content.includes(query) ? 1 : 0);
                const bScore = (b.title.includes(query) ? 2 : 0) + (b.content.includes(query) ? 1 : 0);
                return bScore - aScore;
              });
              return safeJsonResponse(posts.slice(0, 50));
            } catch (e) {
              console.error('搜索失败:', e);
              return safeJsonResponse({ error: '搜索失败' }, 500);
            }
          }
          if (pathname === '/api/rss' && request.method === 'GET') {
            try {
              const list = await env.BLOG_KV.list({ prefix: 'posts/' });
              const posts = [];
              for (const key of list.keys) {
                const post = await env.BLOG_KV.get(key.name, 'json');
                if (post) posts.push(post);
              }
              posts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
              const rss = `<?xml version="1.0" encoding="UTF-8" ?>
              <rss version="2.0">
                <channel>
                  <title>曦月的小窝</title>
                  <link>https://${url.hostname}</link>
                  <description>曦月的个人博客</description>
                  <language>zh-CN</language>
                  ${posts.slice(0, 20).map(post => `
                  <item>
                    <title>${escapeHTML(post.title)}</title>
                    <link>https://${url.hostname}/api/posts/${post.id}</link>
                    <description>${escapeHTML(post.content.substring(0, 200))}...</description>
                    <pubDate>${new Date(post.createdAt).toUTCString()}</pubDate>
                    <guid>${post.id}</guid>
                  </item>`).join('')}
                </channel>
              </rss>`;
              return new Response(rss, {
                headers: {
                  'Content-Type': 'application/rss+xml; charset=utf-8',
                  'Access-Control-Allow-Origin': '*'
                }
              });
            } catch (e) {
              console.error('RSS生成错误:', e);
              return safeJsonResponse({ error: 'RSS生成失败' }, 500);
            }
          }
          return safeJsonResponse({ error: 'API 未找到' }, 404);
        } catch (e) {
          console.error('API 处理时出错:', e);
          return safeJsonResponse({ 
            error: '服务器内部错误',
            details: e.message 
          }, 500);
        }
      }
      return new Response('Not Found', { 
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    } catch (e) {
      console.error('全局错误:', e);
      return safeJsonResponse({ 
        error: '严重错误',
        details: e.message 
      }, 500);
    }
  }
};

const indexHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>曦月的小窝</title>
  <style>
  :root {
    --primary: #6a11cb;
    --secondary: #2575fc;
    --blur: 12px;
  }
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    transition: background 0.5s ease;
  }
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    min-height: 100vh;
    padding: 20px;
    color: #333;
    overflow-x: hidden;
  }
  .container {
    max-width: 1200px;
    margin: 0 auto;
  }
  header {
    text-align: center;
    padding: 30px 0;
    margin-bottom: 30px;
  }
  h1 {
    font-size: 3.5rem;
    background: linear-gradient(to right, #fff, #e0e0e0);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 2px 10px rgba(0,0,0,0.2);
    margin-bottom: 10px;
  }
  .subtitle {
    color: rgba(255, 255, 255, 0.8);
    font-size: 1.2rem;
    max-width: 600px;
    margin: 0 auto;
  }
  .card {
    background: rgba(255, 255, 255, 0.85);
    border-radius: 20px;
    backdrop-filter: blur(var(--blur));
    -webkit-backdrop-filter: blur(var(--blur));
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    padding: 25px;
    margin-bottom: 30px;
    overflow: hidden;
  }
  .card h2 {
    color: var(--primary);
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 2px solid rgba(106, 17, 203, 0.2);
  }
  .form-group {
    margin-bottom: 20px;
  }
  label {
    display: block;
    margin-bottom: 8px;
    font-weight: 600;
    color: var(--primary);
  }
  input, textarea, select {
    width: 100%;
    padding: 12px 15px;
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    font-size: 16px;
    transition: all 0.3s;
  }
  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--secondary);
    box-shadow: 0 0 0 3px rgba(37, 117, 252, 0.2);
  }
  button {
    background: linear-gradient(to right, var(--primary), var(--secondary));
    color: white;
    border: none;
    padding: 12px 25px;
    border-radius: 50px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 4px 15px rgba(106, 17, 203, 0.3);
  }
  button:hover {
    transform: translateY(-2px);
    box-shadow: 0 7px 20px rgba(106, 17, 203, 0.4);
  }
  .post {
    background: white;
    border-radius: 15px;
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
    border-left: 4px solid var(--secondary);
  }
  .post-header {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
    cursor: pointer;
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    margin-right: 12px;
    border: 2px solid var(--secondary);
  }
  .author {
    font-weight: 600;
    color: var(--primary);
  }
  .title-founder {
    background-color: #ff0000;
    color: #ffff00;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 0.8rem;
    display: inline-block;
    margin-left: 5px;
  }
  .title-admin {
    background-color: #000000;
    color: #ffff00;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 0.8rem;
    display: inline-block;
    margin-left: 5px;
  }
  .title-member {
    color: #ff69b4;
    font-size: 0.9rem;
    margin-left: 5px;
  }
  .post-title {
    font-size: 1.5rem;
    margin: 10px 0;
    color: #2c3e50;
  }
  .post-content {
    line-height: 1.6;
    color: #444;
    margin-bottom: 15px;
  }
  .post-meta {
    color: #777;
    font-size: 0.9rem;
    margin-bottom: 10px;
  }
  .comment {
    background: #f8f9fa;
    padding: 12px 15px;
    border-radius: 10px;
    margin-top: 10px;
    border-left: 3px solid var(--primary);
    cursor: pointer;
  }
  .comment-header {
    display: flex;
    align-items: center;
    margin-bottom: 5px;
  }
  .comment-author {
    font-weight: 600;
    color: var(--secondary);
    margin-right: 8px;
  }
  .comment-time {
    color: #777;
    font-size: 0.85rem;
  }
  .controls {
    display: flex;
    gap: 10px;
    margin-top: 15px;
  }
  .btn-delete {
    background: #ff4757;
    padding: 6px 12px;
    font-size: 0.9rem;
  }
  .btn-ban {
    background: #ff9f43;
    padding: 6px 12px;
    font-size: 0.9rem;
  }
  .btn-unban {
    background: #00d2d3;
    padding: 6px 12px;
    font-size: 0.9rem;
  }
  .btn-chat {
    background: #6c5ce7;
    padding: 6px 12px;
    font-size: 0.9rem;
  }
  .btn-mute {
    background: #2ecc71;
    padding: 6px 12px;
    font-size: 0.9rem;
  }
  .btn-unmute {
    background: #e74c3c;
    padding: 6px 12px;
    font-size: 0.9rem;
  }
  .auth-section {
    display: flex;
    gap: 15px;
    margin-top: 10px;
  }
  .user-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .error {
    color: #ff4757;
    background: #ffeaa7;
    padding: 10px;
    border-radius: 8px;
    margin: 15px 0;
    display: none;
  }
  .tabs {
    display: flex;
    margin-bottom: 20px;
    border-bottom: 1px solid #e0e0e0;
  }
  .tab {
    padding: 12px 25px;
    cursor: pointer;
    font-weight: 600;
    color: #777;
  }
  .tab.active {
    color: var(--primary);
    border-bottom: 3px solid var(--primary);
  }
  .tab-content {
    display: none;
  }
  .tab-content.active {
    display: block;
  }
  .banned-user {
    background-color: #ffeaa7;
    border-left-color: #fdcb6e;
  }
  #profileModal {
    display: none;
    max-width: 600px;
    margin: 20px auto;
  }
  .profile-header {
    text-align: center;
    padding: 20px 0;
    border-bottom: 1px solid #e0e0e0;
    margin-bottom: 20px;
  }
  .profile-tabs {
    display: flex;
    margin-bottom: 20px;
    border-bottom: 1px solid #e0e0e0;
  }
  .profile-tab {
    padding: 10px 20px;
    cursor: pointer;
    font-weight: 600;
    color: #777;
  }
  .profile-tab.active {
    color: var(--primary);
    border-bottom: 2px solid var(--primary);
  }
  .profile-tab-content {
    display: none;
  }
  .profile-tab-content.active {
    display: block;
  }
  .chat-container {
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    height: 400px;
  }
  .chat-header {
    background: var(--primary);
    color: white;
    padding: 10px 15px;
    font-weight: bold;
  }
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .message {
    max-width: 80%;
    padding: 10px 15px;
    border-radius: 18px;
    position: relative;
  }
  .message.sent {
    align-self: flex-end;
    background: var(--primary);
    color: white;
    border-bottom-right-radius: 5px;
  }
  .message.received {
    align-self: flex-start;
    background: #f1f1f1;
    color: #333;
    border-bottom-left-radius: 5px;
  }
  .message-time {
    font-size: 0.7rem;
    opacity: 0.7;
    text-align: right;
    margin-top: 3px;
  }
  .chat-input {
    display: flex;
    padding: 10px;
    border-top: 1px solid #e0e0e0;
    gap: 10px;
  }
  .chat-input input {
    flex: 1;
    border-radius: 20px;
    padding: 8px 15px;
  }
  .chat-input button {
    border-radius: 20px;
    padding: 8px 15px;
  }
  .pagination {
    display: flex;
    justify-content: center;
    margin-top: 20px;
    gap: 5px;
  }
  .pagination a {
    padding: 5px 10px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    text-decoration: none;
    color: var(--primary);
  }
  .pagination a.active {
    background: var(--primary);
    color: white;
  }
  .gender-male {
    color: #3498db;
  }
  .gender-female {
    color: #e84393;
  }
  @media (max-width: 768px) {
    h1 {
      font-size: 2.5rem;
    }
    .card {
      padding: 20px 15px;
    }
  }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>曦月的小窝</h1>
      <p class="subtitle">曦月的博客</p>
    </header>
    <div class="auth-section" id="authSection">
    </div>
    <div class="search-bar">
      <input type="text" id="searchInput" placeholder="搜索帖子🔍">
      <button id="searchBtn">搜索</button>
    </div>
    <div class="tabs">
      <div class="tab active" data-tab="posts">全部帖子</div>
      <div class="tab" data-tab="create">发帖</div>
    </div>
    <div id="postsTab" class="tab-content active">
      <div class="card">
        <h2>最新帖子</h2>
        <div id="postsContainer">
        </div>
        <div class="pagination" id="pagination">
          <a href="#" class="active">1</a>
          <a href="#">2</a>
          <a href="#">3</a>
          <a href="#">4</a>
          <a href="#">...</a>
        </div>
      </div>
    </div>
    <div id="createTab" class="tab-content">
      <div class="card">
        <h2>发布新帖</h2>
        <div class="form-group">
          <label for="postTitle">标题</label>
          <input type="text" id="postTitle" placeholder="输入帖子标题">
        </div>
        <div class="form-group">
          <label for="postType">类型</label>
          <select id="postType">
            <option value="text">纯文字</option>
            <option value="image">图文</option>
          </select>
        </div>
        <div class="form-group" id="imageUpload" style="display:none;">
          <label for="postImage">配图</label>
          <input type="url" id="postImage" placeholder="图片URL（可选）">
        </div>
        <div class="form-group">
          <label for="postContent">内容</label>
          <textarea id="postContent" rows="6" placeholder="分享你的想法..."></textarea>
        </div>
        <button id="submitPost">发布</button>
        <div class="error" id="postError"></div>
      </div>
    </div>
    <div id="registerModal" class="card" style="display:none;">
      <h2>注册账号</h2>
      <div class="form-group">
        <label for="regUsername">用户名</label>
        <input type="text" id="regUsername" placeholder="输入用户名">
      </div>
      <div class="form-group">
        <label for="regPassword">密码</label>
        <input type="password" id="regPassword" placeholder="输入密码">
      </div>
      <div class="form-group">
        <label for="regNickname">昵称</label>
        <input type="text" id="regNickname" placeholder="输入昵称（可选）">
      </div>
      <div class="form-group">
        <label for="regAvatar">头像直链(可选)</label>
        <input type="url" id="regAvatar" placeholder="https://example.com/avatar.jpg">
      </div>
      <div class="form-group">
        <label for="regGender">性别</label>
        <select id="regGender">
          <option value="male">♂ 男</option>
          <option value="female">♀ 女</option>
          <option value="unknown">保密</option>
        </select>
      </div>
      <div class="form-group">
        <label for="regBio">个人简介</label>
        <textarea id="regBio" rows="3" placeholder="介绍一下自己吧"></textarea>
      </div>
      <div class="form-group">
        <label for="regInviteCode">邀请码</label>
        <input type="text" id="regInviteCode" placeholder="输入邀请码">
      </div>
      <button id="registerBtn">注册账号</button>
      <div class="error" id="regError"></div>
      <p>已有账号? <a href="#" id="showLogin">去登录</a></p>
    </div>
    <div id="loginModal" class="card">
      <h2>登录账号</h2>
      <div class="form-group">
        <label for="loginUsername">用户名</label>
        <input type="text" id="loginUsername" placeholder="输入用户名">
      </div>
      <div class="form-group">
        <label for="loginPassword">密码</label>
        <input type="password" id="loginPassword" placeholder="输入密码">
      </div>
      <button id="loginBtn">登录</button>
      <div class="error" id="loginError"></div>
      <p>没有账号? <a href="#" id="showRegister">去注册</a></p>
    </div>
    <div id="profileModal" class="card" style="display:none;">
      <div class="profile-header">
        <img id="profileAvatar" class="avatar" style="width:80px;height:80px;">
        <h2 id="profileNickname"></h2>
        <p id="profileUsername" style="color:#777;"></p>
        <p id="profileGender" style="color:#777;font-size:0.9rem;"></p>
        <p id="profileCreatedAt" style="color:#777;font-size:0.9rem;"></p>
      </div>
      <div class="profile-tabs">
        <div class="profile-tab active" data-tab="profile">个人资料</div>
        <div class="profile-tab" data-tab="messages">聊天</div>
      </div>
      <div id="profileTab" class="profile-tab-content active">
        <div class="form-group">
          <label for="editNickname">昵称</label>
          <input type="text" id="editNickname" placeholder="输入昵称">
        </div>
        <div class="form-group">
          <label for="editAvatar">头像直链</label>
          <input type="url" id="editAvatar" placeholder="https://example.com/avatar.jpg">
        </div>
        <div class="form-group">
          <label for="editBio">个人简介</label>
          <textarea id="editBio" rows="3" placeholder="介绍一下自己吧"></textarea>
        </div>
        <div class="form-group">
          <label for="currentPassword">当前密码</label>
          <input type="password" id="currentPassword" placeholder="输入当前密码">
        </div>
        <div class="form-group">
          <label for="newPassword">新密码</label>
          <input type="password" id="newPassword" placeholder="输入新密码">
        </div>
        <button id="saveProfileBtn">保存更改</button>
        <div class="error" id="profileError"></div>
        <div id="chatActions" style="display:none;margin-top:20px;">
          <h3>聊天操作</h3>
          <button id="startChatBtn" class="btn-chat">发送消息</button>
        </div>
        <div id="adminActions" style="display:none;margin-top:20px;">
          <h3>管理员操作</h3>
          <button id="banUserBtn" class="btn-ban" style="display:none;">封禁用户</button>
          <button id="unbanUserBtn" class="btn-unban" style="display:none;">解封用户</button>
          <button id="muteUserBtn" class="btn-mute" style="display:none;">禁言用户</button>
          <button id="unmuteUserBtn" class="btn-unmute" style="display:none;">解除禁言</button>
          <button id="promoteUserBtn" class="btn-admin" style="display:none;">授予管理员</button>
          <button id="demoteUserBtn" class="btn-user" style="display:none;">取消管理员</button>
          <button id="resetPasswordBtn" class="btn-reset" style="display:none;">重置密码</button>
          <button id="logoutUserBtn" class="btn-logout" style="display:none;">强制注销</button>
        </div>
      </div>
      <div id="messagesTab" class="profile-tab-content" style="display:none;">
        <div class="chat-container">
          <div class="chat-header">
            <h3>与 <span id="chatWithUser"></span> 的聊天</h3>
          </div>
          <div class="chat-messages" id="chatMessages">
          </div>
          <div class="chat-input">
            <input type="text" id="chatInput" placeholder="输入消息...">
            <button id="sendChatBtn">发送</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script>
  const state = {
    token: localStorage.getItem('token') || '',
    username: localStorage.getItem('username') || '',
    nickname: localStorage.getItem('nickname') || '',
    role: localStorage.getItem('role') || '',
    title: localStorage.getItem('title') || '注册会员',
    avatar: localStorage.getItem('avatar') || '',
    createdAt: localStorage.getItem('createdAt') || ''
  };
  let currentProfileUser = null;
  let currentPage = 1;
  const postsPerPage = 5;
  
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  const elements = {
    authSection: document.getElementById('authSection'),
    postsContainer: document.getElementById('postsContainer'),
    postTitle: document.getElementById('postTitle'),
    postType: document.getElementById('postType'),
    postImage: document.getElementById('postImage'),
    imageUpload: document.getElementById('imageUpload'),
    postContent: document.getElementById('postContent'),
    submitPost: document.getElementById('submitPost'),
    postError: document.getElementById('postError'),
    loginUsername: document.getElementById('loginUsername'),
    loginPassword: document.getElementById('loginPassword'),
    loginBtn: document.getElementById('loginBtn'),
    loginError: document.getElementById('loginError'),
    regUsername: document.getElementById('regUsername'),
    regPassword: document.getElementById('regPassword'),
    regNickname: document.getElementById('regNickname'),
    regAvatar: document.getElementById('regAvatar'),
    regGender: document.getElementById('regGender'),
    regBio: document.getElementById('regBio'),
    regInviteCode: document.getElementById('regInviteCode'),
    registerBtn: document.getElementById('registerBtn'),
    regError: document.getElementById('regError'),
    showRegister: document.getElementById('showRegister'),
    showLogin: document.getElementById('showLogin'),
    registerModal: document.getElementById('registerModal'),
    loginModal: document.getElementById('loginModal'),
    profileModal: document.getElementById('profileModal'),
    profileAvatar: document.getElementById('profileAvatar'),
    profileNickname: document.getElementById('profileNickname'),
    profileUsername: document.getElementById('profileUsername'),
    profileGender: document.getElementById('profileGender'),
    profileCreatedAt: document.getElementById('profileCreatedAt'),
    editNickname: document.getElementById('editNickname'),
    editAvatar: document.getElementById('editAvatar'),
    editBio: document.getElementById('editBio'),
    currentPassword: document.getElementById('currentPassword'),
    newPassword: document.getElementById('newPassword'),
    saveProfileBtn: document.getElementById('saveProfileBtn'),
    profileError: document.getElementById('profileError'),
    adminActions: document.getElementById('adminActions'),
    chatActions: document.getElementById('chatActions'),
    banUserBtn: document.getElementById('banUserBtn'),
    unbanUserBtn: document.getElementById('unbanUserBtn'),
    muteUserBtn: document.getElementById('muteUserBtn'),
    unmuteUserBtn: document.getElementById('unmuteUserBtn'),
    promoteUserBtn: document.getElementById('promoteUserBtn'),
    demoteUserBtn: document.getElementById('demoteUserBtn'),
    resetPasswordBtn: document.getElementById('resetPasswordBtn'),
    logoutUserBtn: document.getElementById('logoutUserBtn'),
    startChatBtn: document.getElementById('startChatBtn'),
    profileTabs: document.querySelectorAll('.profile-tab'),
    profileTabContents: document.querySelectorAll('.profile-tab-content'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    sendChatBtn: document.getElementById('sendChatBtn'),
    chatWithUser: document.getElementById('chatWithUser'),
    tabs: document.querySelectorAll('.tab'),
    tabContents: document.querySelectorAll('.tab-content'),
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    pagination: document.getElementById('pagination')
  };
  
  function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
  }
  
  function clearError(element) {
    element.textContent = '';
    element.style.display = 'none';
  }
  
  function init() {
    setupEventListeners();
    updateAuthUI();
    loadPosts();
    
    try {
      setInterval(function() {
        var hue = Math.floor(Math.random() * 360);
        document.documentElement.style.setProperty('--primary', 'hsl(' + hue + ', 70%, 50%)');
        document.documentElement.style.setProperty('--secondary', 'hsl(' + ((hue + 60) % 360) + ', 70%, 50%)');
      }, 5000);
    } catch (e) {
      console.error('渐变动画错误:', e);
    }
  }
  
  function setupEventListeners() {
    elements.tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        elements.tabs.forEach(function(t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');
        var tabName = tab.getAttribute('data-tab');
        elements.tabContents.forEach(function(content) {
          content.classList.remove('active');
          if (content.id === tabName + 'Tab') {
            content.classList.add('active');
          }
        });
      });
    });
    
    elements.profileTabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        elements.profileTabs.forEach(function(t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');
        var tabName = tab.getAttribute('data-tab');
        elements.profileTabContents.forEach(function(content) {
          content.classList.remove('active');
          if (content.id === tabName + 'Tab') {
            content.classList.add('active');
            if (tabName === 'messages' && currentProfileUser) {
              elements.chatWithUser.textContent = currentProfileUser;
              loadChatMessages();
            }
          }
        });
      });
    });
    
    elements.loginBtn.addEventListener('click', function() {
      var username = elements.loginUsername.value;
      var password = elements.loginPassword.value;
      if (!username || !password) {
        showError(elements.loginError, '请填写完整信息');
        return;
      }
      fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
      })
      .then(function(response) {
        if (!response.ok) {
          return response.json().then(function(data) {
            throw new Error(data.error || '登录失败');
          });
        }
        return response.json();
      })
      .then(function(data) {
        if (data.token) {
          state.token = data.token;
          state.username = data.username;
          state.nickname = data.nickname || data.username;
          state.role = data.role;
          state.title = data.title || '注册会员';
          state.avatar = data.avatar;
          state.createdAt = data.createdAt;
          localStorage.setItem('token', data.token);
          localStorage.setItem('username', data.username);
          localStorage.setItem('nickname', data.nickname || data.username);
          localStorage.setItem('role', data.role);
          localStorage.setItem('title', data.title || '注册会员');
          localStorage.setItem('avatar', data.avatar);
          localStorage.setItem('createdAt', data.createdAt);
          updateAuthUI();
          clearError(elements.loginError);
          elements.loginUsername.value = '';
          elements.loginPassword.value = '';
        } else {
          throw new Error('登录响应缺少令牌');
        }
      })
      .catch(function(error) {
        console.error('Login error:', error);
        showError(elements.loginError, error.message || '网络错误，请重试');
      });
    });
    
    elements.registerBtn.addEventListener('click', function() {
      var username = elements.regUsername.value;
      var password = elements.regPassword.value;
      var nickname = elements.regNickname.value || username;
      var avatar = elements.regAvatar.value;
      var gender = elements.regGender.value;
      var bio = elements.regBio.value;
      var inviteCode = elements.regInviteCode.value;
      if (!username || !password || !inviteCode) {
        showError(elements.regError, '请填写完整信息');
        return;
      }
      fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: username, 
          password: password,
          nickname: nickname,
          avatar: avatar,
          gender: gender,
          bio: bio,
          inviteCode: inviteCode
        })
      })
      .then(function(response) {
        if (!response.ok) {
          return response.json().then(function(data) {
            throw new Error(data.error || '注册失败');
          });
        }
        return response.json();
      })
      .then(function(data) {
        if (data.success) {
          alert('注册成功！请登录');
          elements.regUsername.value = '';
          elements.regPassword.value = '';
          elements.regNickname.value = '';
          elements.regAvatar.value = '';
          elements.regInviteCode.value = '';
          clearError(elements.regError);
          showLoginModal();
        } else {
          throw new Error('注册响应无效');
        }
      })
      .catch(function(error) {
        console.error('Register error:', error);
        showError(elements.regError, error.message || '网络错误，请重试');
      });
    });
    
    elements.postType.addEventListener('change', function() {
      if (elements.postType.value === 'image') {
        elements.imageUpload.style.display = 'block';
      } else {
        elements.imageUpload.style.display = 'none';
      }
    });
    
    elements.submitPost.addEventListener('click', function() {
      var title = elements.postTitle.value;
      var content = elements.postContent.value;
      var type = elements.postType.value;
      var image = elements.postImage.value;
      if (!title || !content) {
        showError(elements.postError, '标题和内容不能为空');
        return;
      }
      fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + state.token
        },
        body: JSON.stringify({ 
          title: title, 
          content: content, 
          type: type,
          image: image
        })
      })
      .then(function(response) {
        if (!response.ok) {
          return response.json().then(function(data) {
            throw new Error(data.error || '发帖失败');
          });
        }
        return response.json();
      })
      .then(function(data) {
        if (data.postId) {
          elements.postTitle.value = '';
          elements.postContent.value = '';
          elements.postImage.value = '';
          clearError(elements.postError);
          loadPosts();
        } else {
          throw new Error('发帖响应缺少帖子ID');
        }
      })
      .catch(function(error) {
        console.error('Post error:', error);
        showError(elements.postError, error.message || '网络错误，请重试');
      });
    });
    
    elements.showRegister.addEventListener('click', function(e) {
      e.preventDefault();
      showRegisterModal();
    });
    
    elements.showLogin.addEventListener('click', function(e) {
      e.preventDefault();
      showLoginModal();
    });
    
    elements.saveProfileBtn.addEventListener('click', function() {
      const nickname = elements.editNickname.value;
      const avatar = elements.editAvatar.value;
      const bio = elements.editBio.value;
      const currentPassword = elements.currentPassword.value;
      const newPassword = elements.newPassword.value;
      const data = {};
      if (nickname) data.nickname = nickname;
      if (avatar) data.avatar = avatar;
      if (bio) data.bio = bio;
      if (currentPassword && newPassword) {
        data.currentPassword = currentPassword;
        data.newPassword = newPassword;
      }
      fetch('/api/users/' + state.username + '/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + state.token
        },
        body: JSON.stringify(data)
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(data => {
            throw new Error(data.error || '保存失败');
          });
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          alert('资料已更新');
          if (nickname) {
            state.nickname = nickname;
            localStorage.setItem('nickname', nickname);
          }
          if (avatar) {
            state.avatar = avatar;
            localStorage.setItem('avatar', avatar);
          }
          updateAuthUI();
          if (currentProfileUser === state.username) {
            elements.profileNickname.textContent = nickname;
            elements.profileAvatar.src = avatar;
          }
        }
      })
      .catch(error => {
        showError(elements.profileError, error.message);
      });
    });
    
    elements.banUserBtn.addEventListener('click', function() {
      banUser(currentProfileUser);
    });
    
    elements.unbanUserBtn.addEventListener('click', function() {
      unbanUser(currentProfileUser);
    });
    
    elements.muteUserBtn.addEventListener('click', function() {
      muteUser(currentProfileUser);
    });
    
    elements.unmuteUserBtn.addEventListener('click', function() {
      unmuteUser(currentProfileUser);
    });
    
    elements.promoteUserBtn.addEventListener('click', function() {
      promoteUser(currentProfileUser);
    });
    
    elements.demoteUserBtn.addEventListener('click', function() {
      demoteUser(currentProfileUser);
    });
    
    elements.resetPasswordBtn.addEventListener('click', function() {
      resetPassword(currentProfileUser);
    });
    
    elements.logoutUserBtn.addEventListener('click', function() {
      logoutUser(currentProfileUser);
    });
    
    elements.startChatBtn.addEventListener('click', function() {
      document.querySelector('.profile-tab[data-tab="messages"]').click();
    });
    
    elements.sendChatBtn.addEventListener('click', function() {
      const message = elements.chatInput.value.trim();
      if (!message) return;
      fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + state.token
        },
        body: JSON.stringify({
          to: currentProfileUser,
          content: message
        })
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(data => {
            throw new Error(data.error || '发送失败');
          });
        }
        return response.json();
      })
      .then(data => {
        elements.chatInput.value = '';
        loadChatMessages();
      })
      .catch(error => {
        console.error('发送消息失败:', error);
        alert('发送消息失败: ' + error.message);
      });
    });
    
    elements.searchBtn.addEventListener('click', function() {
      const query = elements.searchInput.value.trim();
      if (query && query.length >= 2) {
        searchPosts(query);
      }
    });
    
    elements.searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        const query = elements.searchInput.value.trim();
        if (query && query.length >= 2) {
          searchPosts(query);
        }
      }
    });
    
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('avatar') && e.target.alt) {
        const username = e.target.alt.replace('@', '');
        showUserProfile(username);
      }
      if (e.target.classList.contains('like-btn')) {
        const postId = e.target.getAttribute('data-post-id');
        toggleLike(postId);
      }
    });
  }
  
  function loadPosts(page = 1) {
    fetch('/api/posts')
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(data) {
          throw new Error(data.error || '加载帖子失败');
        });
      }
      return response.json();
    })
    .then(function(posts) {
      const startIndex = (page - 1) * postsPerPage;
      const endIndex = startIndex + postsPerPage;
      const pagePosts = posts.slice(startIndex, endIndex);
      
      var html = '';
      for (var i = 0; i < pagePosts.length; i++) {
        var post = pagePosts[i];
        var safeTitle = escapeHTML(post.title);
        var safeContent = escapeHTML(post.content);
        var safeNickname = escapeHTML(post.nickname || post.author);
        var titleClass = '';
        if (post.title === '创始人') {
          titleClass = 'title-founder';
        } else if (post.title === '管理员') {
          titleClass = 'title-admin';
        } else {
          titleClass = 'title-member';
        }
        
        html += '<div class="post" data-post-id="' + escapeHTML(post.id) + '">' +
          '<div class="post-header" title="' + safeNickname + '">' +
          '<img src="' + escapeHTML(post.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default') + '" ' +
          'alt="@' + escapeHTML(post.author) + '" class="avatar">' +
          '<div>' +
          '<div class="author">' + safeNickname + 
          (post.title ? ' <span class="' + titleClass + '">' + post.title + '</span>' : '') +
          '</div>' +
          '<div class="post-meta">' + 
          new Date(post.createdAt).toLocaleDateString() + ' | ' + (post.wordCount || 0) + '字 | 阅读 ' + (post.views || 0) + 
          '次</div>' +
          '</div>' +
          '</div>' +
          '<h3 class="post-title">' + safeTitle + '</h3>';
        
        if (post.image) {
          html += '<div class="post-image"><img src="' + escapeHTML(post.image) + '" style="max-width:100%;"></div>';
        }
        
        html += '<div class="post-content">' + safeContent + '</div>' +
          '<div class="post-footer">' +
          '<button class="like-btn" data-post-id="' + escapeHTML(post.id) + '">👍🏾' + (post.likes || 0) + '</button>' +
          '</div>';
        
        if (state.username && state.role === 'admin') {
          html += '<div class="controls">' +
            '<button class="btn-delete" data-post-id="' + escapeHTML(post.id) + '">删除</button>' +
            '</div>';
        }
        
        html += '<div class="comments-section">' +
          '<h4>评论</h4>' +
          '<div class="comments-list" data-post-id="' + escapeHTML(post.id) + '">' +
          '<div class="loading-comments">加载评论中...</div>' +
          '</div>';
        
        if (!post.muted) {
          html += '<div class="form-group" style="margin-top: 15px;">' +
            '<textarea class="comment-input" placeholder="发表评论..." ' +
            'data-post-id="' + escapeHTML(post.id) + '" rows="2"></textarea>' +
            '<button class="submit-comment" data-post-id="' + escapeHTML(post.id) + '">评论</button>' +
            '</div>';
        }
        
        html += '</div>' +
          '</div>';
      }
      
      elements.postsContainer.innerHTML = html || '<p>还没有帖子，快来发布第一条吧！</p>';
      
      if (posts.length > postsPerPage) {
        renderPagination(posts.length, page);
      } else {
        elements.pagination.style.display = 'none';
      }
      
      loadAllComments();
      var deleteButtons = document.querySelectorAll('.btn-delete');
      for (var i = 0; i < deleteButtons.length; i++) {
        deleteButtons[i].addEventListener('click', function() {
          var postId = this.getAttribute('data-post-id');
          if (!confirm('确定要删除这个帖子吗？')) return;
          fetch('/api/posts/' + postId, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + state.token }
          })
          .then(function(response) {
            if (!response.ok) {
              return response.json().then(function(data) {
                throw new Error(data.error || '删除失败');
              });
            }
            loadPosts();
          })
          .catch(function(error) {
            alert(error.message || '删除失败');
          });
        });
      }
      
      var commentButtons = document.querySelectorAll('.submit-comment');
      for (var i = 0; i < commentButtons.length; i++) {
        commentButtons[i].addEventListener('click', function() {
          var postId = this.getAttribute('data-post-id');
          var textarea = document.querySelector('.comment-input[data-post-id="' + postId + '"]');
          var content = textarea.value;
          if (!content || content.trim() === '') {
            alert('评论内容不能为空');
            return;
          }
          fetch('/api/posts/' + postId + '/comments', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + state.token
            },
            body: JSON.stringify({ content: content })
          })
          .then(function(response) {
            if (!response.ok) {
              return response.json().then(function(data) {
                throw new Error(data.error || '评论失败');
              });
            }
            textarea.value = '';
            var commentsList = document.querySelector('.comments-list[data-post-id="' + postId + '"]');
            if (commentsList) {
              commentsList.innerHTML = '<div class="loading-comments">加载评论中...</div>';
              loadComments(postId);
            }
          })
          .catch(function(error) {
            alert(error.message || '评论失败');
          });
        });
      }
    })
    .catch(function(error) {
      console.error('Load posts error:', error);
      elements.postsContainer.innerHTML = '<p>加载帖子失败，请刷新重试</p>';
      showError(elements.postError, error.message || '加载帖子失败');
    });
  }
  
  function renderPagination(totalPosts, currentPage) {
    const totalPages = Math.ceil(totalPosts / postsPerPage);
    let html = '';
    
    for (let i = 1; i <= Math.min(4, totalPages); i++) {
      html += `<a href="#" class="${i === currentPage ? 'active' : ''}">${i}</a>`;
    }
    
    if (totalPages > 4) {
      html += '<a href="#">...</a>';
      html += `<a href="#" class="${totalPages === currentPage ? 'active' : ''}">${totalPages}</a>`;
    }
    
    elements.pagination.innerHTML = html;
    elements.pagination.style.display = 'flex';
    
    const pageLinks = elements.pagination.querySelectorAll('a');
    pageLinks.forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const page = parseInt(this.textContent);
        if (!isNaN(page)) {
          loadPosts(page);
        }
      });
    });
  }
  
  function loadAllComments() {
    var commentSections = document.querySelectorAll('.comments-list');
    for (var i = 0; i < commentSections.length; i++) {
      var postId = commentSections[i].getAttribute('data-post-id');
      loadComments(postId);
    }
  }
  
  function loadComments(postId) {
    fetch('/api/posts/' + postId + '/comments')
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(data) {
          throw new Error(data.error || '加载评论失败');
        });
      }
      return response.json();
    })
    .then(function(comments) {
      var commentsList = document.querySelector('.comments-list[data-post-id="' + postId + '"]');
      if (!commentsList) return;
      if (comments.length === 0) {
        commentsList.innerHTML = '<div class="no-comments">还没有评论，快来抢沙发！</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < comments.length; i++) {
        var comment = comments[i];
        var safeContent = escapeHTML(comment.content);
        var safeNickname = escapeHTML(comment.nickname || comment.author);
        var titleClass = '';
        if (comment.title === '创始人') {
          titleClass = 'title-founder';
        } else if (comment.title === '管理员') {
          titleClass = 'title-admin';
        } else {
          titleClass = 'title-member';
        }
        
        html += '<div class="comment" data-comment-id="' + escapeHTML(comment.id) + '" title="' + safeNickname + '">' +
          '<div class="comment-header">' +
          '<img src="' + escapeHTML(comment.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default') + '" ' +
          'alt="@' + escapeHTML(comment.author) + '" class="avatar" style="width:24px;height:24px;margin-right:5px;">' +
          '<span class="comment-author">' + safeNickname + 
          (comment.title ? ' <span class="' + titleClass + '">' + comment.title + '</span>' : '') +
          '</span>' +
          '<span class="comment-time">' + new Date(comment.createdAt).toLocaleString() + '</span>' +
          '</div>' +
          '<p>' + safeContent + '</p>';
        
        if (state.username && (state.role === 'admin' || state.username === comment.author)) {
          html += '<div class="controls">' +
            '<button class="btn-delete" data-comment-id="' + escapeHTML(comment.id) + '" data-post-id="' + escapeHTML(postId) + '">删除</button>' +
            '</div>';
        }
        
        html += '</div>';
      }
      commentsList.innerHTML = html;
      
      var commentDeleteButtons = commentsList.querySelectorAll('.btn-delete');
      for (var i = 0; i < commentDeleteButtons.length; i++) {
        commentDeleteButtons[i].addEventListener('click', function(e) {
          e.stopPropagation();
          var commentId = this.getAttribute('data-comment-id');
          var postId = this.getAttribute('data-post-id');
          if (!confirm('确定要删除这条评论吗？')) return;
          fetch('/api/comments/' + postId + '/' + commentId, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + state.token }
          })
          .then(function(response) {
            if (!response.ok) {
              return response.json().then(function(data) {
                throw new Error(data.error || '删除失败');
              });
            }
            var commentsList = document.querySelector('.comments-list[data-post-id="' + postId + '"]');
            if (commentsList) {
              commentsList.innerHTML = '<div class="loading-comments">加载评论中...</div>';
              loadComments(postId);
            }
          })
          .catch(function(error) {
            alert(error.message || '删除失败');
          });
        });
      }
    })
    .catch(function(error) {
      console.error('Load comments error:', error);
      var commentsList = document.querySelector('.comments-list[data-post-id="' + postId + '"]');
      if (commentsList) {
        commentsList.innerHTML = '<div class="error-comments">加载评论失败</div>';
      }
    });
  }
  
  function updateAuthUI() {
    var html = '';
    if (state.token && state.username) {
      html = '<div class="user-info">' +
        '<img src="' + (state.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default') + '" ' +
        'alt="@' + state.username + '" class="avatar" style="width:40px;height:40px;">' +
        '<div>' +
        '<div>' + state.nickname + 
        (state.title ? ' <span class="' + 
          (state.title === '创始人' ? 'title-founder' : 
          state.title === '管理员' ? 'title-admin' : 'title-member') + 
        '">' + state.title + '</span>' : '') +
        '</div>' +
        '<button id="logoutBtn" style="margin-top:5px;padding:3px 10px;font-size:0.9rem;">退出</button>' +
        '</div>' +
        '</div>';
    } else {
      html = '<button id="loginBtnUI">登录</button>' +
        '<button id="registerBtnUI">注册</button>';
    }
    elements.authSection.innerHTML = html;
    
    if (!state.token || !state.username) {
      elements.loginModal.style.display = 'block';
      elements.registerModal.style.display = 'none';
      elements.profileModal.style.display = 'none';
    } else {
      var logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
      }
    }
    
    var loginBtnUI = document.getElementById('loginBtnUI');
    if (loginBtnUI) {
      loginBtnUI.addEventListener('click', showLoginModal);
    }
    
    var registerBtnUI = document.getElementById('registerBtnUI');
    if (registerBtnUI) {
      registerBtnUI.addEventListener('click', showRegisterModal);
    }
  }
  
  function showLoginModal() {
    elements.loginModal.style.display = 'block';
    elements.registerModal.style.display = 'none';
    elements.profileModal.style.display = 'none';
  }
  
  function showRegisterModal() {
    elements.loginModal.style.display = 'none';
    elements.registerModal.style.display = 'block';
    elements.profileModal.style.display = 'none';
  }
  
  function showUserProfile(username) {
    currentProfileUser = username;
    elements.profileModal.style.display = 'block';
    
    fetch('/api/users/' + username)
    .then(response => {
      if (!response.ok) {
        return response.json().then(data => {
          console.error('API响应错误:', data);
          throw new Error(data.error || '无法获取用户信息');
        });
      }
      return response.json();
    })
    .then(user => {
      elements.profileAvatar.src = user.avatar;
      elements.profileNickname.textContent = user.nickname;
      elements.profileUsername.textContent = '@' + user.username;
      
      if (user.gender === 'male') {
        elements.profileGender.innerHTML = '♂ <span class="gender-male">男</span>';
      } else if (user.gender === 'female') {
        elements.profileGender.innerHTML = '♀ <span class="gender-female">女</span>';
      } else {
        elements.profileGender.textContent = '性别：保密';
      }
      
      if (user.createdAt) {
        elements.profileCreatedAt.textContent = 
          '注册于 ' + new Date(user.createdAt).toLocaleDateString();
      }
      
      if (state.username === username) {
        elements.editNickname.value = user.nickname;
        elements.editAvatar.value = user.avatar;
        elements.editBio.value = user.bio || '';
        elements.chatActions.style.display = 'none';
        elements.adminActions.style.display = 'none';
      } else {
        elements.editNickname.closest('.form-group').style.display = 'none';
        elements.editAvatar.closest('.form-group').style.display = 'none';
        elements.editBio.closest('.form-group').style.display = 'none';
        elements.currentPassword.closest('.form-group').style.display = 'none';
        elements.newPassword.closest('.form-group').style.display = 'none';
        elements.saveProfileBtn.style.display = 'none';
        
        elements.chatActions.style.display = 'block';
        
        if (state.role === 'admin' && username !== ADMIN_USERNAME) {
          elements.adminActions.style.display = 'block';
          if (user.banned) {
            elements.banUserBtn.style.display = 'none';
            elements.unbanUserBtn.style.display = 'block';
          } else {
            elements.banUserBtn.style.display = 'block';
            elements.unbanUserBtn.style.display = 'none';
          }
          if (user.muted) {
            elements.muteUserBtn.style.display = 'none';
            elements.unmuteUserBtn.style.display = 'block';
          } else {
            elements.muteUserBtn.style.display = 'block';
            elements.unmuteUserBtn.style.display = 'none';
          }
          if (user.role === 'admin') {
            elements.promoteUserBtn.style.display = 'none';
            elements.demoteUserBtn.style.display = 'block';
          } else {
            elements.promoteUserBtn.style.display = 'block';
            elements.demoteUserBtn.style.display = 'none';
          }
        } else {
          elements.adminActions.style.display = 'none';
        }
      }
    })
    .catch(error => {
      console.error('获取用户信息失败:', error);
      alert('无法获取用户信息: ' + error.message);
      elements.profileModal.style.display = 'none';
    });
  }
  
  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('nickname');
    localStorage.removeItem('role');
    localStorage.removeItem('title');
    localStorage.removeItem('avatar');
    localStorage.removeItem('createdAt');
    
    state.token = '';
    state.username = '';
    state.nickname = '';
    state.role = '';
    state.title = '注册会员';
    state.avatar = '';
    state.createdAt = '';
    
    updateAuthUI();
    loadPosts();
  }
  
  function banUser(username) {
    if (!confirm('确定要封禁用户 ' + username + ' 吗？')) return;
    fetch('/api/ban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
      },
      body: JSON.stringify({ username: username })
    })
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(data) {
          throw new Error(data.error || '封禁失败');
        });
      }
      return response.json();
    })
    .then(function(data) {
      if (data.user) {
        alert('用户 ' + username + ' 已被封禁');
        if (currentProfileUser === username) {
          elements.banUserBtn.style.display = 'none';
          elements.unbanUserBtn.style.display = 'block';
        }
      }
    })
    .catch(function(error) {
      alert('封禁失败: ' + error.message);
    });
  }
  
  function unbanUser(username) {
    if (!confirm('确定要解封用户 ' + username + ' 吗？')) return;
    fetch('/api/unban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
      },
      body: JSON.stringify({ username: username })
    })
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(data) {
          throw new Error(data.error || '解封失败');
        });
      }
      return response.json();
    })
    .then(function(data) {
      if (data.user) {
        alert('用户 ' + username + ' 已被解封');
        if (currentProfileUser === username) {
          elements.banUserBtn.style.display = 'block';
          elements.unbanUserBtn.style.display = 'none';
        }
      }
    })
    .catch(function(error) {
      alert('解封失败: ' + error.message);
    });
  }
  
  function muteUser(username) {
    if (!confirm('确定要禁言用户 ' + username + ' 吗？')) return;
    fetch('/api/mute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
      },
      body: JSON.stringify({ username: username })
    })
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(data) {
          throw new Error(data.error || '禁言失败');
        });
      }
      return response.json();
    })
    .then(function(data) {
      if (data.user) {
        alert('用户 ' + username + ' 已被禁言');
        if (currentProfileUser === username) {
          elements.muteUserBtn.style.display = 'none';
          elements.unmuteUserBtn.style.display = 'block';
        }
      }
    })
    .catch(function(error) {
      alert('禁言失败: ' + error.message);
    });
  }
  
  function unmuteUser(username) {
    if (!confirm('确定要解除禁言用户 ' + username + ' 吗？')) return;
    fetch('/api/unmute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
      },
      body: JSON.stringify({ username: username })
    })
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(data) {
          throw new Error(data.error || '解除禁言失败');
        });
      }
      return response.json();
    })
    .then(function(data) {
      if (data.user) {
        alert('用户 ' + username + ' 已解除禁言');
        if (currentProfileUser === username) {
          elements.muteUserBtn.style.display = 'block';
          elements.unmuteUserBtn.style.display = 'none';
        }
      }
    })
    .catch(function(error) {
      alert('解除禁言失败: ' + error.message);
    });
  }
  
  function promoteUser(username) {
    if (!confirm('确定要授予用户 ' + username + ' 管理员权限吗？')) return;
    fetch('/api/promote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
      },
      body: JSON.stringify({ username: username })
    })
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(data) {
          throw new Error(data.error || '提升权限失败');
        });
      }
      return response.json();
    })
    .then(function(data) {
      if (data.user) {
        alert('用户 ' + username + ' 已被提升为管理员');
        if (currentProfileUser === username) {
          elements.promoteUserBtn.style.display = 'none';
          elements.demoteUserBtn.style.display = 'block';
        }
      }
    })
    .catch(function(error) {
      alert('提升权限失败: ' + error.message);
    });
  }
  
  function demoteUser(username) {
    if (!confirm('确定要取消用户 ' + username + ' 的管理员权限吗？')) return;
    fetch('/api/demote', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
      },
      body: JSON.stringify({ username: username })
    })
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(data) {
          throw new Error(data.error || '降级权限失败');
        });
      }
      return response.json();
    })
    .then(function(data) {
      if (data.user) {
        alert('用户 ' + username + ' 已被降级');
        if (currentProfileUser === username) {
          elements.promoteUserBtn.style.display = 'block';
          elements.demoteUserBtn.style.display = 'none';
        }
      }
    })
    .catch(function(error) {
      alert('降级权限失败: ' + error.message);
    });
  }
  
  function resetPassword(username) {
    const newPassword = prompt('请输入新密码:', '');
    if (!newPassword || newPassword.length < 6) {
      alert('密码必须至少6个字符');
      return;
    }
    if (!confirm('确定要重置用户 ' + username + ' 的密码吗？')) return;
    fetch('/api/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
      },
      body: JSON.stringify({ 
        username: username,
        newPassword: newPassword
      })
    })
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(data) {
          throw new Error(data.error || '重置密码失败');
        });
      }
      return response.json();
    })
    .then(function(data) {
      alert('密码已重置');
    })
    .catch(function(error) {
      alert('重置密码失败: ' + error.message);
    });
  }
  
  function logoutUser(username) {
    if (!confirm('确定要强制注销用户 ' + username + ' 吗？')) return;
    fetch('/api/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.token
      },
      body: JSON.stringify({ username: username })
    })
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(data) {
          throw new Error(data.error || '强制注销失败');
        });
      }
      return response.json();
    })
    .then(function(data) {
      alert('用户已强制注销');
    })
    .catch(function(error) {
      alert('强制注销失败: ' + error.message);
    });
  }
  
  function searchPosts(query) {
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('搜索失败');
      }
      return response.json();
    })
    .then(posts => {
      var html = '';
      for (var i = 0; i < posts.length; i++) {
        var post = posts[i];
        var safeTitle = escapeHTML(post.title);
        var safeContent = escapeHTML(post.content);
        var safeNickname = escapeHTML(post.nickname || post.author);
        var titleClass = '';
        if (post.title === '创始人') {
          titleClass = 'title-founder';
        } else if (post.title === '管理员') {
          titleClass = 'title-admin';
        } else {
          titleClass = 'title-member';
        }
        
        html += '<div class="post" data-post-id="' + escapeHTML(post.id) + '">' +
          '<div class="post-header" title="' + safeNickname + '">' +
          '<img src="' + escapeHTML(post.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default') + '" ' +
          'alt="@' + escapeHTML(post.author) + '" class="avatar">' +
          '<div>' +
          '<div class="author">' + safeNickname + 
          (post.title ? ' <span class="' + titleClass + '">' + post.title + '</span>' : '') +
          '</div>' +
          '<div class="post-meta">' + 
          new Date(post.createdAt).toLocaleDateString() + ' | ' + (post.wordCount || 0) + '字 | 阅读 ' + (post.views || 0) + 
          '次</div>' +
          '</div>' +
          '</div>' +
          '<h3 class="post-title">' + safeTitle + '</h3>' +
          '<div class="post-content">' + safeContent + '</div>' +
          '<div class="post-footer">' +
          '<button class="like-btn" data-post-id="' + escapeHTML(post.id) + '">👍🏾' + (post.likes || 0) + '</button>' +
          '</div>' +
          '<div class="comments-section">' +
          '<h4>评论</h4>' +
          '<div class="comments-list" data-post-id="' + escapeHTML(post.id) + '">' +
          '<div class="loading-comments">加载评论中...</div>' +
          '</div>' +
          '<div class="form-group" style="margin-top: 15px;">' +
          '<textarea class="comment-input" placeholder="发表评论..." ' +
          'data-post-id="' + escapeHTML(post.id) + '" rows="2"></textarea>' +
          '<button class="submit-comment" data-post-id="' + escapeHTML(post.id) + '">评论</button>' +
          '</div>' +
          '</div>' +
          '</div>';
      }
      
      elements.postsContainer.innerHTML = html || '<p>没有找到相关帖子</p>';
      loadAllComments();
    })
    .catch(error => {
      console.error('搜索失败:', error);
      alert('搜索失败: ' + error.message);
    });
  }
  
  function toggleLike(postId) {
    fetch(`/api/posts/${postId}/like`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + state.token
      }
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(data => {
          throw new Error(data.error || '点赞失败');
        });
      }
      return response.json();
    })
    .then(data => {
      const likeBtn = document.querySelector(`.like-btn[data-post-id="${postId}"]`);
      if (likeBtn) {
        likeBtn.innerHTML = `👍🏾${data.likes}`;
      }
    })
    .catch(error => {
      console.error('点赞失败:', error);
      alert('点赞失败: ' + error.message);
    });
  }
  
  function loadChatMessages() {
    fetch('/api/messages')
    .then(response => {
      if (!response.ok) {
        throw new Error('无法加载消息');
      }
      return response.json();
    })
    .then(messages => {
      var html = '';
      for (var i = 0; i < messages.length; i++) {
        var message = messages[i];
        if ((message.from === state.username && message.to === currentProfileUser) || 
            (message.to === state.username && message.from === currentProfileUser)) {
          var isSent = message.from === state.username;
          var safeContent = escapeHTML(message.content);
          html += '<div class="message ' + (isSent ? 'sent' : 'received') + '">' +
            '<div class="message-content">' + safeContent + '</div>' +
            '<div class="message-time">' + new Date(message.createdAt).toLocaleTimeString() + '</div>' +
            '</div>';
        }
      }
      elements.chatMessages.innerHTML = html;
      elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    })
    .catch(error => {
      console.error('加载消息失败:', error);
    });
  }
  
  document.addEventListener('DOMContentLoaded', function() {
    try {
      init();
    } catch (e) {
      console.error('初始化应用时出错:', e);
      alert('应用初始化失败，请刷新页面重试');
    }
  });
  </script>
</body>
</html>`;