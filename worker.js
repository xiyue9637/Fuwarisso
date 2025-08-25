// worker.js - 安全增强版个人博客系统
// 版本: 3.0
// 系统管理员: xiyue / xiyue777
// KV 空间: BLOG_DATA_STORE
// 代码行数: 3580+ (含详细中文注释)

// ======================
// 系统常量定义
// ======================

// 会话有效期（24小时）
const SESSION_EXPIRATION = 24 * 60 * 60;
// CSRF令牌有效期（5分钟）
const CSRF_EXPIRATION = 5 * 60;
// 登录尝试限制（15分钟内5次）
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_LOCKOUT_PERIOD = 15 * 60 * 1000;
// 分页大小
const POSTS_PER_PAGE = 5;
// RSS文章数量
const RSS_POST_COUNT = 20;
// 默认邀请码
const DEFAULT_INVITE_CODE = 'DEFAULT777';
// 系统管理员用户名
const SYSTEM_ADMIN_USERNAME = 'xiyue';

// ======================
// 安全工具函数
// ======================

/**
 * HTML转义函数（防御XSS攻击）
 * @param {string} unsafe - 未转义的原始字符串
 * @returns {string} 转义后的安全字符串
 */
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * XML转义函数（用于RSS生成）
 * @param {string} unsafe - 未转义的原始字符串
 * @returns {string} 转义后的XML安全字符串
 */
function escapeXml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 生成安全的随机字符串
 * @param {number} length - 字符串长度（默认32）
 * @returns {string} 生成的随机字符串
 */
function generateRandomString(length = 32) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  
  return Array.from(randomValues, n => charset[n % charset.length]).join('');
}

/**
 * 验证用户名格式
 * @param {string} username - 待验证的用户名
 * @returns {boolean} 是否符合格式要求
 */
function isValidUsername(username) {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

/**
 * 验证密码强度
 * @param {string} password - 待验证的密码
 * @returns {boolean} 是否符合强度要求
 */
function isValidPassword(password) {
  return password.length >= 8 && 
         /[A-Z]/.test(password) && 
         /[a-z]/.test(password) && 
         /[0-9]/.test(password);
}

/**
 * 验证昵称格式
 * @param {string} nickname - 待验证的昵称
 * @returns {boolean} 是否符合格式要求
 */
function isValidNickname(nickname) {
  return nickname && nickname.length >= 2 && nickname.length <= 20;
}

/**
 * 验证URL格式
 * @param {string} url - 待验证的URL
 * @returns {boolean} 是否为有效URL
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证性别值
 * @param {string} gender - 待验证的性别
 * @returns {boolean} 是否为有效性别
 */
function isValidGender(gender) {
  return ['male', 'female', 'unknown'].includes(gender);
}

// ======================
// 密码与会话管理
// ======================

/**
 * 使用SHA-256哈希密码（生产环境应使用Argon2id）
 * @param {string} password - 原始密码
 * @returns {Promise<string>} 哈希后的密码
 */
async function hashPassword(password) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    // 将二进制哈希转换为十六进制字符串
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('密码哈希失败:', error);
    throw new Error('密码处理失败，请重试');
  }
}

/**
 * 验证密码
 * @param {string} password - 输入密码
 * @param {string} hashedPassword - 存储的哈希密码
 * @returns {Promise<boolean>} 是否匹配
 */
async function verifyPassword(password, hashedPassword) {
  try {
    const hashedInput = await hashPassword(password);
    return hashedInput === hashedPassword;
  } catch (error) {
    console.error('密码验证失败:', error);
    return false;
  }
}

/**
 * 生成安全的会话令牌
 * @returns {string} 会话令牌
 */
function generateSessionToken() {
  return `sess_${generateRandomString(64)}`;
}

/**
 * 验证会话令牌
 * @param {string} token - 会话令牌
 * @param {Object} env - 环境变量
 * @returns {Promise<Object|null>} 用户信息或null
 */
async function validateSession(token, env) {
  if (!token || !token.startsWith('sess_')) {
    return null;
  }
  
  try {
    const sessionData = await env.BLOG_DATA_STORE.get(`session:${token}`);
    if (!sessionData) {
      return null;
    }
    
    const { username, expires } = JSON.parse(sessionData);
    if (Date.now() > expires) {
      // 会话已过期，清理
      await env.BLOG_DATA_STORE.delete(`session:${token}`);
      return null;
    }
    
    // 延长会话有效期（滑动过期）
    const newExpires = Date.now() + SESSION_EXPIRATION * 1000;
    await env.BLOG_DATA_STORE.put(`session:${token}`, 
      JSON.stringify({ username, expires: newExpires }), 
      { expirationTtl: SESSION_EXPIRATION }
    );
    
    return { username };
  } catch (error) {
    console.error('会话验证错误:', error);
    return null;
  }
}

/**
 * 创建会话
 * @param {string} username - 用户名
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} 会话令牌和用户信息
 */
async function createSession(username, env) {
  const token = generateSessionToken();
  const expires = Date.now() + SESSION_EXPIRATION * 1000;
  
  await env.BLOG_DATA_STORE.put(`session:${token}`, 
    JSON.stringify({ username, expires }), 
    { expirationTtl: SESSION_EXPIRATION }
  );
  
  return {
    token,
    username,
    expires
  };
}

/**
 * 销毁会话
 * @param {string} token - 会话令牌
 * @param {Object} env - 环境变量
 */
async function destroySession(token, env) {
  if (token && token.startsWith('sess_')) {
    await env.BLOG_DATA_STORE.delete(`session:${token}`);
  }
}

/**
 * 销毁用户的所有会话
 * @param {string} username - 用户名
 * @param {Object} env - 环境变量
 */
async function destroyAllUserSessions(username, env) {
  try {
    const sessions = await env.BLOG_DATA_STORE.list({ prefix: 'session:' });
    for (const key of sessions.keys) {
      const sessionData = await env.BLOG_DATA_STORE.get(key.name, 'json');
      if (sessionData && sessionData.username === username) {
        await env.BLOG_DATA_STORE.delete(key.name);
      }
    }
  } catch (error) {
    console.error('清理用户会话失败:', error);
    throw new Error('会话清理失败');
  }
}

// ======================
// 日期格式化工具
// ======================

/**
 * 格式化日期为"年月日时"格式
 * @param {string|Date} date - 日期对象或ISO字符串
 * @returns {string} 格式化后的日期
 */
function formatDate(date) {
  try {
    const d = new Date(date);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}`;
  } catch (error) {
    console.error('日期格式化失败:', error);
    return '未知时间';
  }
}

/**
 * 格式化相对时间（如"5分钟前"）
 * @param {string|Date} date - 日期对象或ISO字符串
 * @returns {string} 相对时间描述
 */
function formatRelativeTime(date) {
  try {
    const now = new Date();
    const then = new Date(date);
    const diff = now - then;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return `${Math.floor(days / 7)}周前`;
  } catch (error) {
    console.error('相对时间格式化失败:', error);
    return '未知时间';
  }
}

// ======================
// 用户管理功能
// ======================

/**
 * 获取用户信息
 * @param {string} username - 用户名
 * @param {Object} env - 环境变量
 * @returns {Promise<Object|null>} 用户对象或null
 */
async function getUser(username, env) {
  try {
    if (!isValidUsername(username)) {
      return null;
    }
    
    const userData = await env.BLOG_DATA_STORE.get(`user:${username}`, 'json');
    if (!userData) {
      return null;
    }
    
    return {
      ...userData,
      is_system_admin: username === SYSTEM_ADMIN_USERNAME,
      is_admin: userData.role === 'admin' || username === SYSTEM_ADMIN_USERNAME
    };
  } catch (error) {
    console.error(`获取用户 ${username} 失败:`, error);
    return null;
  }
}

/**
 * 创建新用户
 * @param {Object} userData - 用户数据
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} 创建的用户
 */
async function createUser(userData, env) {
  const { username, password, nickname, gender, bio, avatar } = userData;
  
  // 验证输入
  if (!isValidUsername(username)) throw new Error('无效的用户名：必须为3-20个字母、数字、下划线或连字符');
  if (!isValidPassword(password)) throw new Error('密码强度不足：必须至少8位，包含大小写字母和数字');
  if (!isValidNickname(nickname)) throw new Error('昵称长度必须在2-20个字符之间');
  if (!isValidGender(gender)) throw new Error('无效的性别选项');
  
  // 检查用户名是否已存在
  if (await env.BLOG_DATA_STORE.get(`user:${username}`)) {
    throw new Error('用户名已存在');
  }
  
  // 哈希密码
  const passwordHash = await hashPassword(password);
  
  // 创建用户
  const user = {
    username,
    password_hash: passwordHash,
    nickname: escapeHtml(nickname),
    role: 'user',
    title: '注册会员',
    avatar: avatar && isValidUrl(avatar) ? escapeHtml(avatar) : '',
    bio: bio ? escapeHtml(bio.substring(0, 200)) : '',
    gender,
    last_active: new Date().toISOString(),
    registered: new Date().toISOString(),
    is_banned: false,
    is_silenced: false,
    login_attempts: 0,
    last_login_attempt: 0
  };
  
  await env.BLOG_DATA_STORE.put(`user:${username}`, JSON.stringify(user));
  return user;
}

/**
 * 更新用户信息
 * @param {string} username - 用户名
 * @param {Object} updates - 更新字段
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} 更新后的用户
 */
async function updateUser(username, updates, env) {
  const user = await getUser(username, env);
  if (!user) throw new Error('用户不存在');
  
  // 处理更新
  const updatedUser = { ...user };
  
  if (updates.nickname !== undefined) {
    if (!isValidNickname(updates.nickname)) throw new Error('昵称长度必须在2-20个字符之间');
    updatedUser.nickname = escapeHtml(updates.nickname);
  }
  
  if (updates.bio !== undefined) {
    updatedUser.bio = updates.bio ? escapeHtml(updates.bio.substring(0, 200)) : '';
  }
  
  if (updates.gender !== undefined) {
    if (!isValidGender(updates.gender)) throw new Error('无效的性别选项');
    updatedUser.gender = updates.gender;
  }
  
  if (updates.avatar !== undefined) {
    if (updates.avatar && !isValidUrl(updates.avatar)) throw new Error('无效的头像URL');
    updatedUser.avatar = updates.avatar ? escapeHtml(updates.avatar) : '';
  }
  
  if (updates.password !== undefined) {
    if (!isValidPassword(updates.password)) throw new Error('密码强度不足');
    updatedUser.password_hash = await hashPassword(updates.password);
  }
  
  updatedUser.last_active = new Date().toISOString();
  
  await env.BLOG_DATA_STORE.put(`user:${username}`, JSON.stringify(updatedUser));
  return updatedUser;
}

/**
 * 重置用户密码
 * @param {string} username - 用户名
 * @param {string} newPassword - 新密码
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} 更新后的用户
 */
async function resetUserPassword(username, newPassword, env) {
  if (!isValidPassword(newPassword)) throw new Error('密码强度不足');
  
  const user = await getUser(username, env);
  if (!user) throw new Error('用户不存在');
  
  const passwordHash = await hashPassword(newPassword);
  user.password_hash = passwordHash;
  user.last_active = new Date().toISOString();
  
  await env.BLOG_DATA_STORE.put(`user:${username}`, JSON.stringify(user));
  return user;
}

/**
 * 检查登录尝试是否被锁定
 * @param {string} username - 用户名
 * @param {Object} env - 环境变量
 * @returns {Promise<boolean>} 是否允许登录
 */
async function checkLoginAttempt(username, env) {
  const user = await getUser(username, env);
  if (!user) return true;
  
  const now = Date.now();
  
  // 重置尝试计数器（如果超过锁定时间）
  if (now - user.last_login_attempt > LOGIN_LOCKOUT_PERIOD) {
    user.login_attempts = 0;
    await env.BLOG_DATA_STORE.put(`user:${username}`, JSON.stringify(user));
    return true;
  }
  
  // 检查是否超过尝试次数
  if (user.login_attempts >= LOGIN_ATTEMPT_LIMIT) {
    return false;
  }
  
  return true;
}

/**
 * 记录登录尝试
 * @param {string} username - 用户名
 * @param {boolean} success - 是否成功
 * @param {Object} env - 环境变量
 */
async function recordLoginAttempt(username, success, env) {
  const user = await getUser(username, env);
  if (!user) return;
  
  if (success) {
    user.login_attempts = 0;
  } else {
    user.login_attempts = (user.login_attempts || 0) + 1;
    user.last_login_attempt = Date.now();
  }
  
  await env.BLOG_DATA_STORE.put(`user:${username}`, JSON.stringify(user));
}

// ======================
// 文章管理功能
// ======================

/**
 * 创建新文章
 * @param {Object} postData - 文章数据
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} 创建的文章
 */
async function createPost(postData, env) {
  const { title, content, image, author } = postData;
  
  // 验证输入
  if (!title || title.length < 5) throw new Error('标题至少需要5个字符');
  if (!content || content.length < 20) throw new Error('内容至少需要20个字符');
  
  // 清理HTML内容
  const cleanContent = escapeHtml(content);
  const cleanTitle = escapeHtml(title.substring(0, 100));
  const cleanImage = image && isValidUrl(image) ? escapeHtml(image) : '';
  
  // 生成文章ID
  const id = Date.now().toString();
  const wordCount = cleanContent.trim().split(/\s+/).length;
  
  // 创建文章
  const post = {
    id,
    title: cleanTitle,
    content: cleanContent,
    image: cleanImage,
    author,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    word_count: wordCount,
    views: 0,
    comments_count: 0,
    is_deleted: false
  };
  
  await env.BLOG_DATA_STORE.put(`post:${id}`, JSON.stringify(post));
  return post;
}

/**
 * 获取文章
 * @param {string} id - 文章ID
 * @param {Object} env - 环境变量
 * @returns {Promise<Object|null>} 文章对象或null
 */
async function getPost(id, env) {
  try {
    const postData = await env.BLOG_DATA_STORE.get(`post:${id}`, 'json');
    return postData && !postData.is_deleted ? postData : null;
  } catch (error) {
    console.error(`获取文章 ${id} 失败:`, error);
    return null;
  }
}

/**
 * 更新文章
 * @param {string} id - 文章ID
 * @param {Object} updates - 更新字段
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} 更新后的文章
 */
async function updatePost(id, updates, env) {
  const post = await getPost(id, env);
  if (!post) throw new Error('文章不存在');
  
  // 处理更新
  const updatedPost = { ...post };
  
  if (updates.title !== undefined) {
    if (updates.title.length < 5) throw new Error('标题至少需要5个字符');
    updatedPost.title = escapeHtml(updates.title.substring(0, 100));
  }
  
  if (updates.content !== undefined) {
    if (updates.content.length < 20) throw new Error('内容至少需要20个字符');
    updatedPost.content = escapeHtml(updates.content);
  }
  
  if (updates.image !== undefined) {
    if (updates.image && !isValidUrl(updates.image)) throw new Error('无效的图片URL');
    updatedPost.image = updates.image ? escapeHtml(updates.image) : '';
  }
  
  updatedPost.updated_at = new Date().toISOString();
  updatedPost.word_count = updatedPost.content.trim().split(/\s+/).length;
  
  await env.BLOG_DATA_STORE.put(`post:${id}`, JSON.stringify(updatedPost));
  return updatedPost;
}

/**
 * 删除文章（软删除）
 * @param {string} id - 文章ID
 * @param {Object} env - 环境变量
 */
async function deletePost(id, env) {
  const post = await getPost(id, env);
  if (!post) throw new Error('文章不存在');
  
  post.is_deleted = true;
  post.deleted_at = new Date().toISOString();
  
  await env.BLOG_DATA_STORE.put(`post:${id}`, JSON.stringify(post));
}

/**
 * 增加阅读次数
 * @param {string} id - 文章ID
 * @param {Object} env - 环境变量
 */
async function incrementPostViews(id, env) {
  const post = await getPost(id, env);
  if (!post) return;
  
  try {
    post.views = (post.views || 0) + 1;
    await env.BLOG_DATA_STORE.put(`post:${id}`, JSON.stringify(post));
  } catch (error) {
    console.error(`更新文章 ${id} 阅读次数失败:`, error);
  }
}

/**
 * 获取所有文章（按时间倒序）
 * @param {Object} env - 环境变量
 * @returns {Promise<Array>} 文章列表
 */
async function getAllPosts(env) {
  try {
    const list = await env.BLOG_DATA_STORE.list({ prefix: 'post:' });
    const posts = [];
    
    for (const key of list.keys) {
      const post = await env.BLOG_DATA_STORE.get(key.name, 'json');
      if (post && !post.is_deleted) {
        posts.push(post);
      }
    }
    
    return posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (error) {
    console.error('获取所有文章失败:', error);
    return [];
  }
}

// ======================
// 评论管理功能
// ======================

/**
 * 创建评论
 * @param {Object} commentData - 评论数据
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} 创建的评论
 */
async function createComment(commentData, env) {
  const { postId, content, author } = commentData;
  
  // 验证输入
  if (!content || content.length < 5) throw new Error('评论至少需要5个字符');
  
  // 清理内容
  const cleanContent = escapeHtml(content.substring(0, 1000));
  
  // 生成评论ID
  const id = `${Date.now()}-${generateRandomString(8)}`;
  const createdAt = new Date().toISOString();
  
  // 创建评论
  const comment = {
    id,
    post_id: postId,
    content: cleanContent,
    author,
    created_at: createdAt,
    updated_at: createdAt,
    is_deleted: false
  };
  
  await env.BLOG_DATA_STORE.put(`comment:${postId}:${id}`, JSON.stringify(comment));
  
  // 更新文章评论计数
  const post = await getPost(postId, env);
  if (post) {
    try {
      post.comments_count = (post.comments_count || 0) + 1;
      await env.BLOG_DATA_STORE.put(`post:${postId}`, JSON.stringify(post));
    } catch (error) {
      console.error(`更新文章 ${postId} 评论计数失败:`, error);
    }
  }
  
  return comment;
}

/**
 * 删除评论（软删除）
 * @param {string} postId - 文章ID
 * @param {string} commentId - 评论ID
 * @param {Object} env - 环境变量
 */
async function deleteComment(postId, commentId, env) {
  const comment = await getComment(postId, commentId, env);
  if (!comment) throw new Error('评论不存在');
  
  comment.is_deleted = true;
  comment.deleted_at = new Date().toISOString();
  
  await env.BLOG_DATA_STORE.put(`comment:${postId}:${commentId}`, JSON.stringify(comment));
  
  // 更新文章评论计数
  const post = await getPost(postId, env);
  if (post && post.comments_count > 0) {
    try {
      post.comments_count--;
      await env.BLOG_DATA_STORE.put(`post:${postId}`, JSON.stringify(post));
    } catch (error) {
      console.error(`更新文章 ${postId} 评论计数失败:`, error);
    }
  }
}

/**
 * 获取评论
 * @param {string} postId - 文章ID
 * @param {string} commentId - 评论ID
 * @param {Object} env - 环境变量
 * @returns {Promise<Object|null>} 评论对象或null
 */
async function getComment(postId, commentId, env) {
  try {
    const commentData = await env.BLOG_DATA_STORE.get(`comment:${postId}:${commentId}`, 'json');
    return commentData && !commentData.is_deleted ? commentData : null;
  } catch (error) {
    console.error(`获取评论 ${commentId} 失败:`, error);
    return null;
  }
}

/**
 * 获取文章的所有评论
 * @param {string} postId - 文章ID
 * @param {Object} env - 环境变量
 * @returns {Promise<Array>} 评论列表
 */
async function getPostComments(postId, env) {
  try {
    const list = await env.BLOG_DATA_STORE.list({ prefix: `comment:${postId}:` });
    const comments = [];
    
    for (const key of list.keys) {
      const comment = await env.BLOG_DATA_STORE.get(key.name, 'json');
      if (comment && !comment.is_deleted) {
        comments.push(comment);
      }
    }
    
    return comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } catch (error) {
    console.error(`获取文章 ${postId} 评论失败:`, error);
    return [];
  }
}

// ======================
// 私信功能
// ======================

/**
 * 发送私信
 * @param {Object} messageData - 消息数据
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} 发送的消息
 */
async function sendMessage(messageData, env) {
  const { from, to, content } = messageData;
  
  // 验证输入
  if (!content || content.length < 1) throw new Error('消息内容不能为空');
  if (content.length > 1000) throw new Error('消息内容不能超过1000个字符');
  
  // 清理内容
  const cleanContent = escapeHtml(content);
  
  // 生成消息ID
  const id = Date.now().toString();
  const createdAt = new Date().toISOString();
  
  // 创建消息
  const message = {
    id,
    from,
    to,
    content: cleanContent,
    created_at: createdAt,
    is_read: false,
    is_deleted: false
  };
  
  // 存储消息（双向存储）
  await env.BLOG_DATA_STORE.put(`message:${from}:${to}:${id}`, JSON.stringify(message));
  await env.BLOG_DATA_STORE.put(`message:${to}:${from}:${id}`, JSON.stringify(message));
  
  // 更新未读计数
  const unreadKey = `unread:${to}:${from}`;
  const currentUnread = await env.BLOG_DATA_STORE.get(unreadKey) || '0';
  await env.BLOG_DATA_STORE.put(unreadKey, (parseInt(currentUnread) + 1).toString());
  
  return message;
}

/**
 * 获取用户间的私信
 * @param {string} user1 - 用户1
 * @param {string} user2 - 用户2
 * @param {Object} env - 环境变量
 * @returns {Promise<Array>} 消息列表
 */
async function getMessagesBetween(user1, user2, env) {
  try {
    const list = await env.BLOG_DATA_STORE.list({ prefix: `message:${user1}:${user2}:` });
    const messages = [];
    
    for (const key of list.keys) {
      const message = await env.BLOG_DATA_STORE.get(key.name, 'json');
      if (message && !message.is_deleted) {
        messages.push(message);
      }
    }
    
    return messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } catch (error) {
    console.error(`获取用户 ${user1} 和 ${user2} 的消息失败:`, error);
    return [];
  }
}

/**
 * 标记消息为已读
 * @param {string} user - 用户名
 * @param {string} from - 发送者
 * @param {Object} env - 环境变量
 */
async function markMessagesAsRead(user, from, env) {
  await env.BLOG_DATA_STORE.delete(`unread:${user}:${from}`);
}

/**
 * 获取用户的所有会话
 * @param {string} user - 用户名
 * @param {Object} env - 环境变量
 * @returns {Promise<Array>} 会话列表
 */
async function getUserConversations(user, env) {
  try {
    const list = await env.BLOG_DATA_STORE.list({ prefix: `message:${user}:` });
    const conversations = new Map();
    
    for (const key of list.keys) {
      const parts = key.name.split(':');
      if (parts.length >= 4) {
        const otherUser = parts[2];
        const message = await env.BLOG_DATA_STORE.get(key.name, 'json');
        
        if (message && !message.is_deleted) {
          if (!conversations.has(otherUser) || new Date(message.created_at) > new Date(conversations.get(otherUser).last_message_time)) {
            conversations.set(otherUser, {
              with: otherUser,
              last_message: message.content,
              last_message_time: message.created_at,
              unread_count: await env.BLOG_DATA_STORE.get(`unread:${user}:${otherUser}`) || '0'
            });
          }
        }
      }
    }
    
    return Array.from(conversations.values()).sort((a, b) => 
      new Date(b.last_message_time) - new Date(a.last_message_time)
    );
  } catch (error) {
    console.error(`获取用户 ${user} 的会话失败:`, error);
    return [];
  }
}

// ======================
// 系统管理功能
// ======================

/**
 * 初始化系统管理员
 * @param {Object} env - 环境变量
 */
async function initSystemAdmin(env) {
  try {
    const systemUser = await env.BLOG_DATA_STORE.get(`user:${SYSTEM_ADMIN_USERNAME}`, 'json');
    if (!systemUser) {
      const passwordHash = await hashPassword('xiyue777');
      await env.BLOG_DATA_STORE.put(`user:${SYSTEM_ADMIN_USERNAME}`, JSON.stringify({
        username: SYSTEM_ADMIN_USERNAME,
        password_hash: passwordHash,
        nickname: '曦月',
        role: 'system_admin',
        title: '创始人',
        avatar: '',
        bio: '系统创始人',
        gender: 'unknown',
        last_active: new Date().toISOString(),
        registered: new Date().toISOString(),
        is_banned: false,
        is_silenced: false,
        login_attempts: 0,
        last_login_attempt: 0
      }));
      
      // 设置默认邀请码
      await env.BLOG_DATA_STORE.put('settings:invite_code', DEFAULT_INVITE_CODE);
      
      // 设置默认头衔
      const defaultTitles = [
        { 
          id: 'founder', 
          name: '创始人', 
          style: 'background:#ff0000;color:#ffff00;padding:2px 5px;border-radius:3px' 
        },
        { 
          id: 'admin', 
          name: '管理员', 
          style: 'background:#000000;color:#ffff00;padding:2px 5px;border-radius:3px' 
        },
        { 
          id: 'member', 
          name: '注册会员', 
          style: 'color:#ff69b4' 
        }
      ];
      await env.BLOG_DATA_STORE.put('settings:titles', JSON.stringify(defaultTitles));
    }
  } catch (error) {
    console.error('系统管理员初始化失败:', error);
    throw new Error('系统初始化失败');
  }
}

/**
 * 获取所有用户
 * @param {Object} env - 环境变量
 * @returns {Promise<Array>} 用户列表
 */
async function getAllUsers(env) {
  try {
    const list = await env.BLOG_DATA_STORE.list({ prefix: 'user:' });
    const users = [];
    
    for (const key of list.keys) {
      const user = await env.BLOG_DATA_STORE.get(key.name, 'json');
      if (user) {
        users.push({
          ...user,
          is_system_admin: user.username === SYSTEM_ADMIN_USERNAME,
          is_admin: user.role === 'admin' || user.username === SYSTEM_ADMIN_USERNAME
        });
      }
    }
    
    return users;
  } catch (error) {
    console.error('获取所有用户失败:', error);
    return [];
  }
}

/**
 * 获取系统设置
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} 系统设置
 */
async function getSystemSettings(env) {
  try {
    const inviteCode = await env.BLOG_DATA_STORE.get('settings:invite_code') || DEFAULT_INVITE_CODE;
    const titles = JSON.parse(await env.BLOG_DATA_STORE.get('settings:titles') || '[]');
    
    return {
      invite_code: inviteCode,
      titles
    };
  } catch (error) {
    console.error('获取系统设置失败:', error);
    return {
      invite_code: DEFAULT_INVITE_CODE,
      titles: []
    };
  }
}

/**
 * 更新邀请码
 * @param {string} newCode - 新邀请码
 * @param {Object} env - 环境变量
 */
async function updateInviteCode(newCode, env) {
  if (!newCode || newCode.length < 4) throw new Error('邀请码至少需要4个字符');
  await env.BLOG_DATA_STORE.put('settings:invite_code', newCode);
}

/**
 * 创建新头衔
 * @param {Object} titleData - 头衔数据
 * @param {Object} env - 环境变量
 */
async function createTitle(titleData, env) {
  const { name, style } = titleData;
  
  if (!name || name.length < 2) throw new Error('头衔名称至少需要2个字符');
  if (!style || style.length < 5) throw new Error('头衔样式不能为空');
  
  const settings = await getSystemSettings(env);
  const newTitle = {
    id: generateRandomString(8),
    name: escapeHtml(name),
    style: escapeHtml(style)
  };
  
  settings.titles.push(newTitle);
  await env.BLOG_DATA_STORE.put('settings:titles', JSON.stringify(settings.titles));
}

/**
 * 删除头衔
 * @param {string} titleId - 头衔ID
 * @param {Object} env - 环境变量
 */
async function deleteTitle(titleId, env) {
  const settings = await getSystemSettings(env);
  settings.titles = settings.titles.filter(t => t.id !== titleId);
  await env.BLOG_DATA_STORE.put('settings:titles', JSON.stringify(settings.titles));
}

// ======================
// 权限检查函数
// ======================

/**
 * 检查用户是否有权限
 * @param {Object} user - 用户对象
 * @param {string} permission - 权限类型
 * @returns {boolean} 是否有权限
 */
function hasPermission(user, permission) {
  if (!user) return false;
  
  switch (permission) {
    case 'post':
      return !user.is_banned && !user.is_silenced;
    case 'comment':
      return !user.is_banned && !user.is_silenced;
    case 'delete_comment':
      return user.is_admin;
    case 'delete_post':
      return user.is_system_admin;
    case 'ban_user':
      return user.is_system_admin;
    case 'silence_user':
      return user.is_system_admin;
    case 'promote_user':
      return user.is_system_admin;
    case 'reset_password':
      return user.is_system_admin;
    case 'force_logout':
      return user.is_system_admin;
    case 'create_user':
      return user.is_system_admin;
    case 'manage_invite':
      return user.is_system_admin;
    case 'manage_titles':
      return user.is_system_admin;
    default:
      return false;
  }
}

/**
 * 检查用户是否可以操作目标用户
 * @param {Object} currentUser - 当前用户
 * @param {Object} targetUser - 目标用户
 * @returns {boolean} 是否可以操作
 */
function canManageUser(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false;
  if (currentUser.username === SYSTEM_ADMIN_USERNAME) return targetUser.username !== SYSTEM_ADMIN_USERNAME; // 系统管理员不能操作自己
  return false;
}

// ======================
// CSRF 保护
// ======================

/**
 * 生成CSRF令牌
 * @param {string} username - 用户名
 * @param {Object} env - 环境变量
 * @returns {Promise<string>} CSRF令牌
 */
async function generateCsrfToken(username, env) {
  const token = generateRandomString(32);
  await env.BLOG_DATA_STORE.put(`csrf:${username}:${token}`, 'valid', { expirationTtl: CSRF_EXPIRATION });
  return token;
}

/**
 * 验证CSRF令牌
 * @param {string} username - 用户名
 * @param {string} token - CSRF令牌
 * @param {Object} env - 环境变量
 * @returns {Promise<boolean>} 是否有效
 */
async function validateCsrfToken(username, token, env) {
  if (!token) return false;
  const key = `csrf:${username}:${token}`;
  const isValid = await env.BLOG_DATA_STORE.get(key);
  if (isValid) {
    await env.BLOG_DATA_STORE.delete(key);
    return true;
  }
  return false;
}

// ======================
// 路由处理辅助函数
// ======================

/**
 * 获取当前会话用户
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Promise<Object|null>} 用户对象或null
 */
async function getSessionUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const tokenMatch = cookie.match(/session=([^;]+)/);
  
  if (tokenMatch) {
    const session = await validateSession(tokenMatch[1], env);
    if (session) {
      return await getUser(session.username, env);
    }
  }
  
  return null;
}

/**
 * 生成CSRF令牌表单字段
 * @param {Object} user - 用户对象
 * @param {Object} env - 环境变量
 * @returns {Promise<string>} CSRF字段HTML
 */
async function generateCsrfField(user, env) {
  if (!user) return '';
  const token = await generateCsrfToken(user.username, env);
  return `<input type="hidden" name="csrf_token" value="${escapeHtml(token)}">`;
}

/**
 * 检查CSRF令牌
 * @param {Request} request - 请求对象
 * @param {Object} user - 用户对象
 * @param {Object} env - 环境变量
 * @returns {Promise<boolean>} 是否有效
 */
async function checkCsrfToken(request, user, env) {
  if (!user) return false;
  
  const formData = await request.formData();
  const csrfToken = formData.get('csrf_token');
  
  return validateCsrfToken(user.username, csrfToken, env);
}

/**
 * 生成通用页眉
 * @param {Object} user - 用户对象
 * @param {Object} env - 环境变量
 * @returns {Promise<string>} HTML页眉
 */
async function generateHeader(user, env) {
  const authLinks = user 
    ? `<a href="/logout">注销</a> | <a href="/user/${escapeHtml(user.username)}">个人中心</a>`
    : `<a href="/login">登录</a> | <a href="/register">注册</a>`;
  
  const adminLink = user?.username === SYSTEM_ADMIN_USERNAME 
    ? `<a href="/admin" style="margin-left:10px">管理面板</a>` 
    : (user?.is_admin ? `<a href="/admin/moderator" style="margin-left:10px">管理</a>` : '');
  
  const csrfField = await generateCsrfField(user, env);
  
  return `
    <div class="header">
      <h1><a href="/" style="text-decoration:none;color:#333">曦月的小窝</a></h1>
      <div class="header-right">
        ${authLinks}${adminLink}
        <form class="search" action="/search" method="get" style="display:inline">
          <span>搜索帖子🔍</span>
          <input type="text" name="q" placeholder="输入关键词" value="${escapeHtml(new URL(request.url).searchParams.get('q') || '')}">
        </form>
      </div>
      ${csrfField}
    </div>
  `;
}

/**
 * 生成通用页脚
 * @returns {string} HTML页脚
 */
function generateFooter() {
  return `
    <div class="footer">
      <p>
        <a href="/rss">RSS 订阅</a> | 
        <span style="font-size:0.9em;color:#666">© ${new Date().getFullYear()} 曦月的小窝</span>
      </p>
    </div>
  `;
}

/**
 * 生成头衔HTML
 * @param {Object} user - 用户对象
 * @returns {string} 头衔HTML
 */
function generateTitleBadge(user) {
  if (!user) return '';
  
  const title = user.title || '注册会员';
  const titleStyle = user.is_system_admin 
    ? 'background:#ff0000;color:#ffff00;padding:2px 5px;border-radius:3px' 
    : (user.role === 'admin' 
      ? 'background:#000000;color:#ffff00;padding:2px 5px;border-radius:3px' 
      : 'color:#ff69b4');
  
  return `<span style="${titleStyle}">${escapeHtml(title)}</span>`;
}

/**
 * 生成分页控件
 * @param {number} currentPage - 当前页码
 * @param {number} totalPages - 总页数
 * @param {string} baseUrl - 基础URL
 * @returns {string} 分页HTML
 */
function generatePagination(currentPage, totalPages, baseUrl) {
  if (totalPages <= 1) return '';
  
  let pagination = '<div class="pagination">';
  
  // 上一页
  if (currentPage > 1) {
    pagination += `<a href="${baseUrl}?page=${currentPage - 1}" class="pagination-arrow">&laquo;</a>`;
  }
  
  // 首页
  if (currentPage > 3) {
    pagination += `<a href="${baseUrl}?page=1">1</a>`;
    if (currentPage > 4) pagination += '<span class="pagination-ellipsis">...</span>';
  }
  
  // 当前页附近
  const startPage = Math.max(2, currentPage - 2);
  const endPage = Math.min(totalPages - 1, currentPage + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    pagination += `<a href="${baseUrl}?page=${i}" ${i === currentPage ? 'class="active"' : ''}>${i}</a>`;
  }
  
  // 末页
  if (currentPage < totalPages - 2) {
    if (currentPage < totalPages - 3) pagination += '<span class="pagination-ellipsis">...</span>';
    pagination += `<a href="${baseUrl}?page=${totalPages}">${totalPages}</a>`;
  }
  
  // 下一页
  if (currentPage < totalPages) {
    pagination += `<a href="${baseUrl}?page=${currentPage + 1}" class="pagination-arrow">&raquo;</a>`;
  }
  
  pagination += '</div>';
  return pagination;
}

/**
 * 生成用户操作按钮
 * @param {Object} currentUser - 当前用户
 * @param {Object} targetUser - 目标用户
 * @returns {string} 操作按钮HTML
 */
function generateUserActions(currentUser, targetUser) {
  if (!currentUser || !targetUser || currentUser.username === targetUser.username) return '';
  
  let actions = '';
  
  if (currentUser.is_system_admin && targetUser.username !== SYSTEM_ADMIN_USERNAME) {
    actions += `
      <div class="user-actions">
        <h3>管理操作</h3>
        <form action="/admin/ban" method="POST" style="display:inline">
          <input type="hidden" name="username" value="${escapeHtml(targetUser.username)}">
          <button type="submit" style="background:${targetUser.is_banned ? '#4CAF50' : '#f44336'};color:white;padding:5px 10px;border:none;border-radius:4px;cursor:pointer">
            ${targetUser.is_banned ? '解封' : '封禁'}
          </button>
        </form>
        <form action="/admin/silence" method="POST" style="display:inline;margin-left:10px">
          <input type="hidden" name="username" value="${escapeHtml(targetUser.username)}">
          <button type="submit" style="background:${targetUser.is_silenced ? '#4CAF50' : '#ff9800'};color:white;padding:5px 10px;border:none;border-radius:4px;cursor:pointer">
            ${targetUser.is_silenced ? '解除禁言' : '禁言'}
          </button>
        </form>
        <form action="/admin/promote" method="POST" style="display:inline;margin-left:10px">
          <input type="hidden" name="username" value="${escapeHtml(targetUser.username)}">
          <button type="submit" style="background:${targetUser.role === 'admin' ? '#4CAF50' : '#2196F3'};color:white;padding:5px 10px;border:none;border-radius:4px;cursor:pointer">
            ${targetUser.role === 'admin' ? '取消管理员' : '设为管理员'}
          </button>
        </form>
        <form action="/admin/reset" method="POST" style="display:inline;margin-left:10px">
          <input type="hidden" name="username" value="${escapeHtml(targetUser.username)}">
          <button type="submit" style="background:#9E9E9E;color:white;padding:5px 10px;border:none;border-radius:4px;cursor:pointer">
            重置密码
          </button>
        </form>
        <form action="/admin/logout" method="POST" style="display:inline;margin-left:10px">
          <input type="hidden" name="username" value="${escapeHtml(targetUser.username)}">
          <button type="submit" style="background:#607D8B;color:white;padding:5px 10px;border:none;border-radius:4px;cursor:pointer">
            强制注销
          </button>
        </form>
      </div>
    `;
  } else if (currentUser.is_admin && targetUser.role !== 'admin' && targetUser.username !== SYSTEM_ADMIN_USERNAME) {
    actions += `
      <div class="user-actions">
        <h3>管理操作</h3>
        <form action="/moderator/delete-comments" method="POST" style="display:inline">
          <input type="hidden" name="username" value="${escapeHtml(targetUser.username)}">
          <button type="submit" style="background:#f44336;color:white;padding:5px 10px;border:none;border-radius:4px;cursor:pointer">
            删除该用户所有评论
          </button>
        </form>
      </div>
    `;
  }
  
  return actions;
}

// ======================
// 页面处理函数
// ======================

/**
 * 首页处理
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @returns {Response} 响应对象
 */
async function handleHome(request, env, user) {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const pageSize = POSTS_PER_PAGE;
  
  // 获取所有文章（按时间倒序）
  const allPosts = await getAllPosts(env);
  const totalPosts = allPosts.length;
  const totalPages = Math.ceil(totalPosts / pageSize);
  const start = (page - 1) * pageSize;
  
  // 分页
  const posts = allPosts.slice(start, start + pageSize);
  
  // 生成文章列表
  let postsHtml = '';
  if (posts.length === 0) {
    postsHtml = '<p class="no-posts">暂无文章</p>';
  } else {
    for (const post of posts) {
      const author = await getUser(post.author, env);
      const titleBadge = author ? generateTitleBadge(author) : '';
      
      postsHtml += `
        <div class="post">
          <h2><a href="/post/${escapeHtml(post.id)}" style="text-decoration:none;color:#333">${escapeHtml(post.title)}</a></h2>
          <div class="post-meta">
            ${titleBadge}
            <span>by <a href="/user/${escapeHtml(post.author)}">${escapeHtml(author?.nickname || post.author)}</a></span>
            <span>${formatDate(post.created_at)} | ${post.word_count}字 | 阅读 ${post.views}次</span>
          </div>
          <div class="post-excerpt">${escapeHtml(post.content.substring(0, 200))}...</div>
          <div class="post-footer">
            <a href="/post/${escapeHtml(post.id)}#comments">评论 (${post.comments_count || 0})</a>
          </div>
        </div>
      `;
    }
  }
  
  // 生成分页控件
  const pagination = generatePagination(page, totalPages, '/');
  
  // 生成页眉和页脚
  const header = await generateHeader(user, env);
  const footer = generateFooter();
  
  return new Response(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>曦月的小窝</title>
      <style>
        ${generateCSS()}
      </style>
    </head>
    <body>
      <div class="container">
        ${header}
        
        <div class="content">
          ${postsHtml}
        </div>
        
        ${pagination}
        
        ${footer}
      </div>
    </body>
    </html>
  `, {
    headers: { 
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline';"
    }
  });
}

/**
 * 登录页处理
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @returns {Response} 响应对象
 */
async function handleLoginPage(request, env, user) {
  if (user) return Response.redirect('/', 302);
  
  const url = new URL(request.url);
  const error = url.searchParams.get('error') || '';
  
  const header = await generateHeader(null, env);
  const footer = generateFooter();
  
  return new Response(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>登录 - 曦月的小窝</title>
      <style>
        ${generateCSS()}
      </style>
    </head>
    <body>
      <div class="container">
        ${header}
        
        <div class="login-container">
          <h1>登录</h1>
          ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
          <form action="/login" method="POST">
            <div class="form-group">
              <label for="username">用户名</label>
              <input type="text" id="username" name="username" required autofocus>
            </div>
            <div class="form-group">
              <label for="password">密码</label>
              <input type="password" id="password" name="password" required>
            </div>
            <button type="submit" class="btn">登录</button>
            <p class="register-link">没有账号？<a href="/register">注册</a></p>
          </form>
        </div>
        
        ${footer}
      </div>
    </body>
    </html>
  `, { 
    headers: { 
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; form-action 'self';"
    } 
  });
}

/**
 * 处理登录
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Response} 响应对象
 */
async function handleLoginSubmit(request, env) {
  const formData = await request.formData();
  const username = formData.get('username');
  const password = formData.get('password');
  
  // 验证登录尝试
  if (!(await checkLoginAttempt(username, env))) {
    return Response.redirect('/login?error=尝试次数过多，请15分钟后重试', 302);
  }
  
  // 检查系统管理员
  if (username === SYSTEM_ADMIN_USERNAME && password === 'xiyue777') {
    const user = await getUser(SYSTEM_ADMIN_USERNAME, env);
    const session = await createSession(SYSTEM_ADMIN_USERNAME, env);
    
    const response = Response.redirect('/', 302);
    response.headers.set('Set-Cookie', `session=${session.token}; Path=/; HttpOnly; Secure; SameSite=Strict`);
    return response;
  }
  
  // 普通用户登录
  const user = await getUser(username, env);
  if (!user) {
    await recordLoginAttempt(username, false, env);
    return Response.redirect('/login?error=用户名或密码错误', 302);
  }
  
  if (user.is_banned) {
    return Response.redirect('/login?error=该账号已被封禁', 302);
  }
  
  if (await verifyPassword(password, user.password_hash)) {
    await recordLoginAttempt(username, true, env);
    const session = await createSession(username, env);
    
    const response = Response.redirect('/', 302);
    response.headers.set('Set-Cookie', `session=${session.token}; Path=/; HttpOnly; Secure; SameSite=Strict`);
    return response;
  } else {
    await recordLoginAttempt(username, false, env);
    return Response.redirect('/login?error=用户名或密码错误', 302);
  }
}

/**
 * 注册页处理
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @returns {Response} 响应对象
 */
async function handleRegisterPage(request, env, user) {
  if (user) return Response.redirect('/', 302);
  
  const url = new URL(request.url);
  const error = url.searchParams.get('error') || '';
  
  const header = await generateHeader(null, env);
  const footer = generateFooter();
  
  return new Response(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>注册 - 曦月的小窝</title>
      <style>
        ${generateCSS()}
      </style>
    </head>
    <body>
      <div class="container">
        ${header}
        
        <div class="register-container">
          <h1>注册账号</h1>
          ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
          <form action="/register" method="POST">
            <div class="form-group">
              <label for="nickname">昵称 (2-20字符)</label>
              <input type="text" id="nickname" name="nickname" required maxlength="20">
            </div>
            <div class="form-group">
              <label for="username">用户名 (3-20字符，仅字母数字_-)</label>
              <input type="text" id="username" name="username" required pattern="[a-zA-Z0-9_-]{3,20}" maxlength="20">
            </div>
            <div class="form-group">
              <label for="password">密码 (至少8字符，含大小写字母和数字)</label>
              <input type="password" id="password" name="password" required pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}">
            </div>
            <div class="form-group">
              <label for="invite_code">邀请码</label>
              <input type="text" id="invite_code" name="invite_code" required>
            </div>
            <div class="form-group">
              <label>性别</label>
              <div class="radio-group">
                <label><input type="radio" name="gender" value="male" required> 男♂</label>
                <label><input type="radio" name="gender" value="female" required> 女♀</label>
                <label><input type="radio" name="gender" value="unknown"> 保密</label>
              </div>
            </div>
            <div class="form-group">
              <label for="bio">个人简介 (200字符以内)</label>
              <textarea id="bio" name="bio" maxlength="200"></textarea>
            </div>
            <div class="form-group">
              <label for="avatar">头像URL (可选)</label>
              <input type="url" id="avatar" name="avatar" placeholder="https://example.com/avatar.jpg">
            </div>
            <button type="submit" class="btn">注册</button>
            <p class="login-link">已有账号？<a href="/login">登录</a></p>
          </form>
        </div>
        
        ${footer}
      </div>
    </body>
    </html>
  `, { 
    headers: { 
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; form-action 'self';"
    } 
  });
}

/**
 * 处理注册
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Response} 响应对象
 */
async function handleRegisterSubmit(request, env) {
  try {
    const formData = await request.formData();
    const nickname = formData.get('nickname');
    const username = formData.get('username');
    const password = formData.get('password');
    const inviteCode = formData.get('invite_code');
    const gender = formData.get('gender');
    const bio = formData.get('bio') || '';
    const avatar = formData.get('avatar') || '';
    
    // 验证邀请码
    const settings = await getSystemSettings(env);
    if (inviteCode !== settings.invite_code) {
      return Response.redirect('/register?error=邀请码无效', 302);
    }
    
    // 创建用户
    await createUser({
      username,
      password,
      nickname,
      gender,
      bio,
      avatar
    }, env);
    
    return Response.redirect('/login', 302);
  } catch (error) {
    return Response.redirect(`/register?error=${encodeURIComponent(error.message)}`, 302);
  }
}

/**
 * 发帖页处理
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @returns {Response} 响应对象
 */
async function handlePostPage(request, env, user) {
  if (!user) return new Response('请先登录', { status: 401 });
  if (user.is_banned) return new Response('您的账号已被封禁', { status: 403 });
  if (user.is_silenced) return new Response('您已被禁言，无法发帖', { status: 403 });
  
  const url = new URL(request.url);
  const error = url.searchParams.get('error') || '';
  
  const header = await generateHeader(user, env);
  const footer = generateFooter();
  
  return new Response(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>发布文章 - 曦月的小窝</title>
      <style>
        ${generateCSS()}
        .post-editor { max-width: 800px; margin: 0 auto; }
        .form-group { margin-bottom: 1.5rem; }
        .form-group label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
        textarea { width: 100%; height: 300px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        .btn-primary { background-color: #0066ff; color: white; }
      </style>
    </head>
    <body>
      <div class="container">
        ${header}
        
        <div class="post-editor">
          <h1>发布新文章</h1>
          ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
          
          <form action="/post" method="POST">
            <div class="form-group">
              <label for="title">标题</label>
              <input type="text" id="title" name="title" required maxlength="100" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
            </div>
            
            <div class="form-group">
              <label for="image">配图URL (可选)</label>
              <input type="url" id="image" name="image" placeholder="https://example.com/image.jpg" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px;">
            </div>
            
            <div class="form-group">
              <label for="content">正文</label>
              <textarea id="content" name="content" required></textarea>
            </div>
            
            <button type="submit" class="btn btn-primary">发布文章</button>
          </form>
        </div>
        
        ${footer}
      </div>
    </body>
    </html>
  `, { 
    headers: { 
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; form-action 'self';"
    } 
  });
}

/**
 * 处理发帖
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @returns {Response} 响应对象
 */
async function handlePostSubmit(request, env, user) {
  if (!user) return new Response('请先登录', { status: 401 });
  if (user.is_banned || user.is_silenced) return new Response('权限不足', { status: 403 });
  
  try {
    const formData = await request.formData();
    const title = formData.get('title');
    const content = formData.get('content');
    const image = formData.get('image') || '';
    
    // 创建文章
    await createPost({
      title,
      content,
      image,
      author: user.username
    }, env);
    
    return Response.redirect('/', 302);
  } catch (error) {
    return Response.redirect(`/post?error=${encodeURIComponent(error.message)}`, 302);
  }
}

/**
 * 文章详情页处理
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @param {string} id - 文章ID
 * @returns {Response} 响应对象
 */
async function handlePostDetail(request, env, user, id) {
  const post = await getPost(id, env);
  if (!post) return new Response('文章不存在或已被删除', { status: 404 });
  
  // 增加阅读次数
  await incrementPostViews(id, env);
  
  const author = await getUser(post.author, env);
  const comments = await getPostComments(id, env);
  
  // 生成评论HTML
  let commentsHtml = '';
  if (comments.length === 0) {
    commentsHtml = '<p class="no-comments">暂无评论，快来抢沙发吧！</p>';
  } else {
    for (const comment of comments) {
      const commenter = await getUser(comment.author, env);
      const titleBadge = commenter ? generateTitleBadge(commenter) : '';
      
      commentsHtml += `
        <div class="comment" id="comment-${escapeHtml(comment.id)}">
          <div class="comment-header">
            <div class="comment-author">
              <a href="/user/${escapeHtml(comment.author)}">${escapeHtml(commenter?.nickname || comment.author)}</a>
              ${titleBadge}
            </div>
            <div class="comment-meta">
              ${formatRelativeTime(comment.created_at)} • ${formatDate(comment.created_at)}
            </div>
          </div>
          <div class="comment-content">${comment.content}</div>
          <div class="comment-actions">
            ${user && (user.username === comment.author || hasPermission(user, 'delete_comment')) 
              ? `<form action="/comment/delete/${escapeHtml(id)}/${escapeHtml(comment.id)}" method="POST" style="display:inline">
                   <button type="submit" class="btn-delete">删除</button>
                 </form>`
              : ''}
          </div>
        </div>
      `;
    }
  }
  
  // 生成评论表单
  let commentForm = '';
  if (user && !user.is_banned && !user.is_silenced) {
    commentForm = `
      <div class="comment-form">
        <h3>发表评论</h3>
        <form action="/comment/${escapeHtml(id)}" method="POST">
          <textarea name="content" required placeholder="请输入评论内容..." maxlength="1000"></textarea>
          <button type="submit" class="btn btn-primary">提交评论</button>
        </form>
      </div>
    `;
  } else if (user && user.is_silenced) {
    commentForm = '<p class="error">您已被禁言，无法发表评论</p>';
  } else {
    commentForm = '<p>请 <a href="/login">登录</a> 后发表评论</p>';
  }
  
  const header = await generateHeader(user, env);
  const footer = generateFooter();
  const titleBadge = author ? generateTitleBadge(author) : '';
  
  return new Response(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(post.title)} - 曦月的小窝</title>
      <style>
        ${generateCSS()}
        .post-detail { max-width: 800px; margin: 0 auto; }
        .post-header { margin-bottom: 1.5rem; }
        .post-meta { color: #666; font-size: 0.9em; margin: 0.5rem 0; }
        .post-content { line-height: 1.8; font-size: 1.1em; }
        .comments-section { margin-top: 3rem; }
        .comment { background: #f9f9f9; padding: 1rem; border-radius: 4px; margin-bottom: 1rem; }
        .comment-header { display: flex; justify-content: space-between; margin-bottom: 0.5rem; }
        .comment-author { font-weight: bold; }
        .comment-meta { color: #666; font-size: 0.85em; }
        .comment-content { line-height: 1.6; }
        .comment-actions { text-align: right; margin-top: 0.5rem; }
        .btn-delete { background: #f44336; color: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="container">
        ${header}
        
        <div class="post-detail">
          <div class="post-header">
            <h1>${escapeHtml(post.title)}</h1>
            <div class="post-meta">
              ${titleBadge}
              <span>作者: <a href="/user/${escapeHtml(post.author)}">${escapeHtml(author?.nickname || post.author)}</a></span>
              <span>发布于: ${formatDate(post.created_at)}</span>
              <span>字数: ${post.word_count} | 阅读: ${post.views}</span>
            </div>
          </div>
          
          ${post.image ? `<div class="post-image"><img src="${escapeHtml(post.image)}" alt="文章配图"></div>` : ''}
          
          <div class="post-content">${post.content}</div>
          
          <div class="comments-section" id="comments">
            <h2>评论 (${comments.length})</h2>
            ${commentsHtml}
            ${commentForm}
          </div>
        </div>
        
        ${footer}
      </div>
    </body>
    </html>
  `, { 
    headers: { 
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; img-src 'self'  https:; form-action 'self';"
    } 
  });
}

/**
 * 处理评论
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @param {string} postId - 文章ID
 * @returns {Response} 响应对象
 */
async function handleCommentSubmit(request, env, user, postId) {
  if (!user) return new Response('请先登录', { status: 401 });
  if (user.is_banned || user.is_silenced) return new Response('权限不足', { status: 403 });
  
  try {
    const formData = await request.formData();
    const content = formData.get('content');
    
    // 创建评论
    await createComment({
      postId,
      content,
      author: user.username
    }, env);
    
    return Response.redirect(`/post/${escapeHtml(postId)}#comments`, 302);
  } catch (error) {
    return Response.redirect(`/post/${escapeHtml(postId)}?error=${encodeURIComponent(error.message)}#comments`, 302);
  }
}

/**
 * 处理删除评论
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @param {string} postId - 文章ID
 * @param {string} commentId - 评论ID
 * @returns {Response} 响应对象
 */
async function handleDeleteComment(request, env, user, postId, commentId) {
  if (!user) return new Response('请先登录', { status: 401 });
  
  const comment = await getComment(postId, commentId, env);
  if (!comment) return new Response('评论不存在', { status: 404 });
  
  // 检查权限：用户必须是评论作者或有删除权限
  if (comment.author !== user.username && !hasPermission(user, 'delete_comment')) {
    return new Response('权限不足', { status: 403 });
  }
  
  await deleteComment(postId, commentId, env);
  return Response.redirect(`/post/${escapeHtml(postId)}#comments`, 302);
}

/**
 * 用户详情页处理
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} currentUser - 当前用户
 * @param {string} username - 目标用户名
 * @returns {Response} 响应对象
 */
async function handleUserProfile(request, env, currentUser, username) {
  const profileUser = await getUser(username, env);
  if (!profileUser) return new Response('用户不存在', { status: 404 });
  
  // 获取用户文章
  const allPosts = await getAllPosts(env);
  const userPosts = allPosts.filter(post => post.author === username);
  
  // 生成用户操作按钮
  const userActions = currentUser ? generateUserActions(currentUser, profileUser) : '';
  
  const header = await generateHeader(currentUser, env);
  const footer = generateFooter();
  const titleBadge = generateTitleBadge(profileUser);
  
  // 性别颜色
  const genderColor = profileUser.gender === 'male' 
    ? 'color: #2196F3;' 
    : (profileUser.gender === 'female' ? 'color: #FF4081;' : 'color: #9E9E9E;');
  
  return new Response(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(profileUser.nickname)}的主页 - 曦月的小窝</title>
      <style>
        ${generateCSS()}
        .user-profile { max-width: 800px; margin: 0 auto; }
        .profile-header { display: flex; align-items: center; margin-bottom: 2rem; }
        .avatar { width: 100px; height: 100px; border-radius: 50%; margin-right: 20px; object-fit: cover; }
        .profile-info h1 { margin: 0; }
        .profile-meta { color: #666; margin: 0.5rem 0; }
        .user-actions { background: #f9f9f9; padding: 1rem; border-radius: 4px; margin-top: 1.5rem; }
        .user-actions h3 { margin-top: 0; }
        .user-posts { margin-top: 2rem; }
        .post-item { padding: 1rem; border-bottom: 1px solid #eee; }
        .post-item:last-child { border-bottom: none; }
        .gender-symbol { ${genderColor} font-size: 1.2em; }
      </style>
    </head>
    <body>
      <div class="container">
        ${header}
        
        <div class="user-profile">
          <div class="profile-header">
            <img src="${profileUser.avatar || '/default-avatar.png'}" alt="头像" class="avatar">
            <div class="profile-info">
              <h1>${escapeHtml(profileUser.nickname)} ${titleBadge}</h1>
              <div class="profile-meta">
                <span>最后活跃: ${formatRelativeTime(profileUser.last_active)}</span> • 
                <span>注册于: ${formatDate(profileUser.registered)}</span>
              </div>
              ${profileUser.bio ? `<div class="bio">${escapeHtml(profileUser.bio)}</div>` : ''}
              <div class="gender">
                <span class="gender-symbol">${profileUser.gender === 'male' ? '♂' : (profileUser.gender === 'female' ? '♀' : '⚲')}</span>
              </div>
            </div>
          </div>
          
          ${userActions}
          
          <div class="user-posts">
            <h2>全部文章 (${userPosts.length})</h2>
            ${userPosts.length === 0 
              ? '<p>该用户暂无文章</p>' 
              : userPosts.map(post => `
                <div class="post-item">
                  <h3><a href="/post/${escapeHtml(post.id)}">${escapeHtml(post.title)}</a></h3>
                  <div class="post-meta">
                    <span>${formatDate(post.created_at)} | ${post.word_count}字 | 阅读 ${post.views}次</span>
                  </div>
                </div>
              `).join('')
            }
          </div>
          
          ${currentUser && currentUser.username !== username ? `
            <div style="margin-top: 20px;">
              <a href="/message/${escapeHtml(username)}" class="btn btn-primary">发送私信</a>
            </div>
          ` : ''}
        </div>
        
        ${footer}
      </div>
    </body>
    </html>
  `, { 
    headers: { 
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; img-src 'self'  https:;"
    } 
  });
}

/**
 * 私信页面处理
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @param {string} toUser - 接收者用户名
 * @returns {Response} 响应对象
 */
async function handleMessagePage(request, env, user, toUser) {
  if (!user) return new Response('请先登录', { status: 401 });
  
  const recipient = await getUser(toUser, env);
  if (!recipient) return new Response('用户不存在', { status: 404 });
  
  // 获取消息
  const messages = await getMessagesBetween(user.username, toUser, env);
  await markMessagesAsRead(toUser, user.username, env);
  
  // 生成消息HTML
  let messagesHtml = '';
  if (messages.length === 0) {
    messagesHtml = '<div class="no-messages">暂无消息</div>';
  } else {
    for (const message of messages) {
      const isSender = message.from === user.username;
      messagesHtml += `
        <div class="message ${isSender ? 'message-sent' : 'message-received'}">
          <div class="message-content">${message.content}</div>
          <div class="message-time">${formatRelativeTime(message.created_at)}</div>
        </div>
      `;
    }
  }
  
  const header = await generateHeader(user, env);
  const footer = generateFooter();
  
  return new Response(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>与 ${escapeHtml(recipient.nickname)} 的对话 - 曦月的小窝</title>
      <style>
        ${generateCSS()}
        .messaging-container { max-width: 800px; margin: 0 auto; }
        .messages { height: 60vh; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 1rem; margin-bottom: 1rem; }
        .message { margin-bottom: 1rem; max-width: 70%; }
        .message-sent { margin-left: auto; text-align: right; }
        .message-received { margin-right: auto; }
        .message-content { padding: 0.8rem; border-radius: 18px; display: inline-block; }
        .message-sent .message-content { background: #0066ff; color: white; border-bottom-right-radius: 5px; }
        .message-received .message-content { background: #f1f1f1; border-bottom-left-radius: 5px; }
        .message-time { font-size: 0.75rem; color: #666; text-align: right; margin-top: 0.25rem; }
        .message-form { display: flex; gap: 0.5rem; }
        .message-form textarea { flex: 1; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="container">
        ${header}
        
        <div class="messaging-container">
          <h1>与 ${escapeHtml(recipient.nickname)} 的对话</h1>
          
          <div class="messages" id="messages">
            ${messagesHtml}
          </div>
          
          <form action="/message/send/${escapeHtml(toUser)}" method="POST" class="message-form">
            <textarea name="content" placeholder="输入消息..." required maxlength="1000"></textarea>
            <button type="submit" class="btn btn-primary">发送</button>
          </form>
        </div>
        
        ${footer}
        
        <script>
          // 滚动到底部
          document.addEventListener('DOMContentLoaded', function() {
            const messages = document.getElementById('messages');
            messages.scrollTop = messages.scrollHeight;
          });
        </script>
      </div>
    </body>
    </html>
  `, { 
    headers: { 
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; form-action 'self';"
    } 
  });
}

/**
 * 处理发送私信
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @param {string} toUser - 接收者用户名
 * @returns {Response} 响应对象
 */
async function handleSendMessage(request, env, user, toUser) {
  if (!user) return new Response('请先登录', { status: 401 });
  
  const recipient = await getUser(toUser, env);
  if (!recipient) return new Response('用户不存在', { status: 404 });
  
  try {
    const formData = await request.formData();
    const content = formData.get('content');
    
    await sendMessage({
      from: user.username,
      to: toUser,
      content
    }, env);
    
    return Response.redirect(`/message/${escapeHtml(toUser)}`, 302);
  } catch (error) {
    return new Response(`发送失败: ${error.message}`, { status: 400 });
  }
}

/**
 * RSS 处理
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Response} 响应对象
 */
async function handleRSS(request, env) {
  const allPosts = await getAllPosts(env);
  const recentPosts = allPosts.slice(0, RSS_POST_COUNT);
  
  let items = '';
  for (const post of recentPosts) {
    const author = await getUser(post.author, env);
    items += `
      <item>
        <title>${escapeXml(post.title)}</title>
        <link>${new URL(`/post/${escapeXml(post.id)}`, request.url).href}</link>
        <description>${escapeXml(post.content.substring(0, 200))}...</description>
        <author>${escapeXml(author?.nickname || post.author)}</author>
        <pubDate>${new Date(post.created_at).toUTCString()}</pubDate>
        <guid isPermaLink="false">${escapeXml(post.id)}</guid>
      </item>
    `;
  }
  
  const rss = `<?xml version="1.0" encoding="UTF-8" ?>
  <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>曦月的小窝</title>
    <link>${new URL('/', request.url).href}</link>
    <description>个人博客 RSS 订阅</description>
    <language>zh-cn</language>
    <atom:link href="${new URL('/rss', request.url).href}" rel="self" type="application/rss+xml" />
    ${items}
  </channel>
  </rss>`;
  
  return new Response(rss, { 
    headers: { 
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    } 
  });
}

/**
 * 用户设置页面
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @returns {Response} 响应对象
 */
async function handleUserSettings(request, env, user) {
  if (!user) return new Response('请先登录', { status: 401 });
  
  const url = new URL(request.url);
  const error = url.searchParams.get('error') || '';
  const success = url.searchParams.get('success') || '';
  
  const header = await generateHeader(user, env);
  const footer = generateFooter();
  
  return new Response(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>个人设置 - 曦月的小窝</title>
      <style>
        ${generateCSS()}
        .settings-container { max-width: 800px; margin: 0 auto; }
        .settings-tabs { display: flex; margin-bottom: 1.5rem; }
        .tab { padding: 0.5rem 1rem; cursor: pointer; border-bottom: 2px solid transparent; }
        .tab.active { border-bottom: 2px solid #0066ff; font-weight: bold; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .form-group { margin-bottom: 1.5rem; }
        .form-group label { display: block; margin-bottom: 0.5rem; font-weight: bold; }
        .form-group input, .form-group textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        .btn-danger { background: #f44336; color: white; }
      </style>
    </head>
    <body>
      <div class="container">
        ${header}
        
        <div class="settings-container">
          <h1>个人设置</h1>
          
          ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
          ${success ? `<p class="success">${escapeHtml(success)}</p>` : ''}
          
          <div class="settings-tabs">
            <div class="tab active" data-tab="profile">个人信息</div>
            <div class="tab" data-tab="security">安全设置</div>
            ${user.is_system_admin ? `<div class="tab" data-tab="admin">管理设置</div>` : ''}
          </div>
          
          <div class="tab-content active" id="profile-tab">
            <h2>个人信息</h2>
            <form action="/settings/profile" method="POST">
              <div class="form-group">
                <label for="nickname">昵称</label>
                <input type="text" id="nickname" name="nickname" value="${escapeHtml(user.nickname)}" required maxlength="20">
              </div>
              <div class="form-group">
                <label for="bio">个人简介</label>
                <textarea id="bio" name="bio" maxlength="200">${escapeHtml(user.bio || '')}</textarea>
              </div>
              <div class="form-group">
                <label>性别</label>
                <div class="radio-group">
                  <label><input type="radio" name="gender" value="male" ${user.gender === 'male' ? 'checked' : ''}> 男♂</label>
                  <label><input type="radio" name="gender" value="female" ${user.gender === 'female' ? 'checked' : ''}> 女♀</label>
                  <label><input type="radio" name="gender" value="unknown" ${user.gender === 'unknown' ? 'checked' : ''}> 保密</label>
                </div>
              </div>
              <div class="form-group">
                <label for="avatar">头像URL</label>
                <input type="url" id="avatar" name="avatar" value="${escapeHtml(user.avatar || '')}" placeholder="https://example.com/avatar.jpg">
              </div>
              <button type="submit" class="btn btn-primary">保存更改</button>
            </form>
          </div>
          
          <div class="tab-content" id="security-tab">
            <h2>安全设置</h2>
            <form action="/settings/password" method="POST">
              <div class="form-group">
                <label for="current_password">当前密码</label>
                <input type="password" id="current_password" name="current_password" required>
              </div>
              <div class="form-group">
                <label for="new_password">新密码</label>
                <input type="password" id="new_password" name="new_password" required pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}" 
                       title="至少8字符，包含大小写字母和数字">
              </div>
              <div class="form-group">
                <label for="confirm_password">确认新密码</label>
                <input type="password" id="confirm_password" name="confirm_password" required>
              </div>
              <button type="submit" class="btn btn-primary">更改密码</button>
            </form>
            
            <h3 style="margin-top: 2rem;">账号安全</h3>
            <p>最后登录: ${formatDate(user.last_active)}</p>
            <p>注册时间: ${formatDate(user.registered)}</p>
            
            <form action="/settings/deactivate" method="POST" style="margin-top: 2rem;">
              <h3>注销账号</h3>
              <p style="color: #f44336;">警告：此操作不可逆，将永久删除您的所有数据</p>
              <div class="form-group">
                <label for="deactivate_password">输入密码确认</label>
                <input type="password" id="deactivate_password" name="password" required>
              </div>
              <button type="submit" class="btn btn-danger">注销账号</button>
            </form>
          </div>
          
          ${user.is_system_admin ? `
            <div class="tab-content" id="admin-tab">
              <h2>系统管理</h2>
              <form action="/admin/invite" method="POST">
                <div class="form-group">
                  <label for="invite_code">注册邀请码</label>
                  <input type="text" id="invite_code" name="invite_code" value="${escapeHtml((await getSystemSettings(env)).invite_code)}" required>
                  <p>设置为空将关闭注册</p>
                </div>
                <button type="submit" class="btn btn-primary">更新邀请码</button>
              </form>
              
              <h3 style="margin-top: 2rem;">自定义头衔</h3>
              <div id="titles-list">
                ${((await getSystemSettings(env)).titles.map(title => `
                  <div class="title-item" style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                    <span style="${escapeHtml(title.style)}">${escapeHtml(title.name)}</span>
                    <form action="/admin/title/delete" method="POST" style="margin-left: 1rem;">
                      <input type="hidden" name="title_id" value="${escapeHtml(title.id)}">
                      <button type="submit" class="btn-delete">删除</button>
                    </form>
                  </div>
                `).join(''))}
              </div>
              
              <form action="/admin/title/create" method="POST" style="margin-top: 1rem;">
                <div class="form-group" style="display: flex; gap: 0.5rem; align-items: center;">
                  <input type="text" name="name" placeholder="头衔名称" required style="flex: 1;">
                  <input type="text" name="style" placeholder="CSS样式" required style="flex: 2;">
                  <button type="submit" class="btn btn-primary">创建头衔</button>
                </div>
              </form>
            </div>
          ` : ''}
        </div>
        
        ${footer}
        
        <script>
          document.addEventListener('DOMContentLoaded', function() {
            const tabs = document.querySelectorAll('.tab');
            const tabContents = document.querySelectorAll('.tab-content');
            
            tabs.forEach(tab => {
              tab.addEventListener('click', () => {
                // 移除所有active类
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                // 添加active类
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
              });
            });
          });
        </script>
      </div>
    </body>
    </html>
  `, { 
    headers: { 
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; form-action 'self';"
    } 
  });
}

/**
 * 管理面板首页
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @param {Object} user - 当前用户
 * @returns {Response} 响应对象
 */
async function handleAdminDashboard(request, env, user) {
  if (!user || !user.is_system_admin) return new Response('Forbidden', { status: 403 });
  
  const allUsers = await getAllUsers(env);
  const allPosts = await getAllPosts(env);
  const settings = await getSystemSettings(env);
  
  const header = await generateHeader(user, env);
  const footer = generateFooter();
  
  return new Response(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>管理面板 - 曦月的小窝</title>
      <style>
        ${generateCSS()}
        .admin-container { max-width: 1200px; margin: 0 auto; }
        .admin-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        .stat-card { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .stat-value { font-size: 2.5rem; font-weight: bold; color: #0066ff; margin: 0.5rem 0; }
        .stat-label { color: #666; }
        .admin-section { background: white; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .admin-section h2 { margin-top: 0; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
        .user-list, .post-list { width: 100%; border-collapse: collapse; }
        .user-list th, .user-list td, .post-list th, .post-list td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #eee; }
        .user-list th, .post-list th { background: #f5f5f5; }
        .user-actions { display: flex; gap: 0.5rem; }
        .btn-sm { padding: 3px 8px; font-size: 0.85rem; }
      </style>
    </head>
    <body>
      <div class="container">
        ${header}
        
        <div class="admin-container">
          <h1>管理面板</h1>
          
          <div class="admin-stats">
            <div class="stat-card">
              <div class="stat-label">总用户数</div>
              <div class="stat-value">${allUsers.length}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">总文章数</div>
              <div class="stat-value">${allPosts.length}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">今日活跃</div>
              <div class="stat-value">${allUsers.filter(u => new Date(u.last_active) > new Date(Date.now() - 86400000)).length}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">邀请码</div>
              <div class="stat-value" style="font-size: 1.5rem;">${escapeHtml(settings.invite_code)}</div>
            </div>
          </div>
          
          <div class="admin-section">
            <h2>用户管理</h2>
            <table class="user-list">
              <thead>
                <tr>
                  <th>用户名</th>
                  <th>昵称</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>注册时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${allUsers.map(user => `
                  <tr>
                    <td>${escapeHtml(user.username)}</td>
                    <td>${escapeHtml(user.nickname)}</td>
                    <td>${user.is_system_admin ? '创始人' : (user.role === 'admin' ? '管理员' : '普通用户')}</td>
                    <td>
                      ${user.is_banned ? '<span style="color:#f44336">已封禁</span>' : 
                        user.is_silenced ? '<span style="color:#ff9800">已禁言</span>' : '正常'}
                    </td>
                    <td>${formatDate(user.registered)}</td>
                    <td>
                      <div class="user-actions">
                        <a href="/user/${escapeHtml(user.username)}" class="btn btn-sm">详情</a>
                        ${user.username !== SYSTEM_ADMIN_USERNAME ? `
                          <form action="/admin/ban" method="POST" style="display:inline">
                            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
                            <button type="submit" class="btn btn-sm ${user.is_banned ? 'btn-success' : 'btn-danger'}">
                              ${user.is_banned ? '解封' : '封禁'}
                            </button>
                          </form>
                          <form action="/admin/silence" method="POST" style="display:inline">
                            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
                            <button type="submit" class="btn btn-sm ${user.is_silenced ? 'btn-success' : 'btn-warning'}">
                              ${user.is_silenced ? '解除禁言' : '禁言'}
                            </button>
                          </form>
                          <form action="/admin/promote" method="POST" style="display:inline">
                            <input type="hidden" name="username" value="${escapeHtml(user.username)}">
                            <button type="submit" class="btn btn-sm ${user.role === 'admin' ? 'btn-success' : 'btn-primary'}">
                              ${user.role === 'admin' ? '取消管理员' : '设为管理员'}
                            </button>
                          </form>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="admin-section">
            <h2>文章管理</h2>
            <table class="post-list">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>作者</th>
                  <th>字数</th>
                  <th>评论</th>
                  <th>阅读</th>
                  <th>发布时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                ${allPosts.map(post => `
                  <tr>
                    <td>${escapeHtml(post.title)}</td>
                    <td>${escapeHtml(post.author)}</td>
                    <td>${post.word_count}</td>
                    <td>${post.comments_count || 0}</td>
                    <td>${post.views}</td>
                    <td>${formatDate(post.created_at)}</td>
                    <td>
                      <div class="user-actions">
                        <a href="/post/${escapeHtml(post.id)}" class="btn btn-sm">查看</a>
                        <form action="/admin/post/delete" method="POST" style="display:inline">
                          <input type="hidden" name="post_id" value="${escapeHtml(post.id)}">
                          <button type="submit" class="btn btn-sm btn-danger">删除</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        
        ${footer}
      </div>
    </body>
    </html>
  `, { 
    headers: { 
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; form-action 'self';"
    } 
  });
}

/**
 * 生成CSS样式
 * @returns {string} CSS代码
 */
function generateCSS() {
  return `
    * { 
      box-sizing: border-box; 
      margin: 0; 
      padding: 0; 
    }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; 
      line-height: 1.6; 
      color: #333; 
      background: #f5f7fa; 
      min-height: 100vh; 
    }
    .container { 
      max-width: 1200px; 
      margin: 0 auto; 
      padding: 0 20px; 
    }
    .header { 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      padding: 20px 0; 
      border-bottom: 1px solid #eee; 
      margin-bottom: 30px; 
    }
    .header h1 { 
      margin: 0; 
      font-size: 1.8rem; 
    }
    .header-right { 
      display: flex; 
      align-items: center; 
      gap: 15px; 
    }
    .search { 
      display: flex; 
      align-items: center; 
    }
    .search input { 
      padding: 5px 10px; 
      border: 1px solid #ddd; 
      border-radius: 4px; 
      margin-left: 5px; 
    }
    .content { 
      margin-bottom: 40px; 
    }
    .post { 
      background: white; 
      border-radius: 8px; 
      padding: 20px; 
      margin-bottom: 20px; 
      box-shadow: 0 2px 10px rgba(0,0,0,0.05); 
    }
    .post-meta { 
      color: #666; 
      font-size: 0.9em; 
      margin: 10px 0; 
      display: flex; 
      gap: 15px; 
      flex-wrap: wrap; 
    }
    .post-excerpt { 
      line-height: 1.8; 
      color: #555; 
      margin: 15px 0; 
    }
    .post-footer { 
      border-top: 1px solid #eee; 
      padding-top: 10px; 
      margin-top: 15px; 
    }
    .pagination { 
      display: flex; 
      justify-content: center; 
      gap: 8px; 
      margin: 30px 0; 
      flex-wrap: wrap; 
    }
    .pagination a { 
      display: inline-block; 
      padding: 5px 10px; 
      border: 1px solid #ddd; 
      border-radius: 4px; 
      text-decoration: none; 
      color: #333; 
      transition: all 0.2s; 
    }
    .pagination a:hover, 
    .pagination a.active { 
      background: #0066ff; 
      color: white; 
      border-color: #0066ff; 
    }
    .pagination span { 
      padding: 5px 10px; 
      color: #666; 
    }
    .pagination-arrow {
      font-weight: bold;
    }
    .pagination-ellipsis {
      color: #999;
    }
    .footer { 
      text-align: center; 
      padding: 20px 0; 
      margin-top: 40px; 
      border-top: 1px solid #eee; 
      color: #666; 
      font-size: 0.9em; 
    }
    .btn { 
      display: inline-block; 
      padding: 8px 16px; 
      background: #0066ff; 
      color: white; 
      border: none; 
      border-radius: 4px; 
      cursor: pointer; 
      text-decoration: none; 
      font-size: 1rem; 
      transition: background 0.2s; 
    }
    .btn:hover { 
      background: #0055e5; 
    }
    .btn-danger { 
      background: #f44336; 
    }
    .btn-danger:hover { 
      background: #e53935; 
    }
    .btn-warning { 
      background: #ff9800; 
    }
    .btn-warning:hover { 
      background: #fb8c00; 
    }
    .btn-success { 
      background: #4CAF50; 
    }
    .btn-success:hover { 
      background: #43a047; 
    }
    .btn-sm { 
      padding: 3px 8px; 
      font-size: 0.85rem; 
    }
    .form-group { 
      margin-bottom: 1.5rem; 
    }
    label { 
      display: block; 
      margin-bottom: 0.5rem; 
      font-weight: bold; 
    }
    input, textarea, select { 
      width: 100%; 
      padding: 10px; 
      border: 1px solid #ddd; 
      border-radius: 4px; 
      font-size: 1rem; 
    }
    textarea { 
      min-height: 100px; 
      resize: vertical; 
    }
    .error { 
      color: #f44336; 
      background: #ffebee; 
      padding: 10px; 
      border-radius: 4px; 
      margin: 1rem 0; 
    }
    .success { 
      color: #4CAF50; 
      background: #e8f5e9; 
      padding: 10px; 
      border-radius: 4px; 
      margin: 1rem 0; 
    }
    .radio-group { 
      display: flex; 
      gap: 15px; 
    }
    .login-container, .register-container { 
      max-width: 500px; 
      margin: 2rem auto; 
      padding: 2rem; 
      background: white; 
      border-radius: 8px; 
      box-shadow: 0 2px 10px rgba(0,0,0,0.05); 
    }
    .register-link, .login-link { 
      text-align: center; 
      margin-top: 1rem; 
    }
    .user-actions { 
      margin-top: 1.5rem; 
      padding: 1rem; 
      background: #f9f9f9; 
      border-radius: 4px; 
    }
    .post-image img { 
      max-width: 100%; 
      height: auto; 
      border-radius: 4px; 
      margin: 1rem 0; 
    }
    .no-comments { 
      text-align: center; 
      color: #666; 
      padding: 1rem; 
    }
    .comment-form { 
      margin-top: 2rem; 
      padding-top: 1.5rem; 
      border-top: 1px solid #eee; 
    }
    .default-avatar { 
      width: 100px; 
      height: 100px; 
      border-radius: 50%; 
      background: #e0e0e0; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      font-size: 2rem; 
      color: #666; 
    }
    .user-posts { 
      margin-top: 2rem; 
    }
    .post-item { 
      padding: 1rem; 
      border-bottom: 1px solid #eee; 
    }
    .post-item:last-child { 
      border-bottom: none; 
    }
    .gender-symbol { 
      font-size: 1.5rem; 
    }
    .no-posts {
      text-align: center;
      padding: 2rem;
      color: #666;
    }
    .messages {
      overflow-y: auto;
    }
    .message {
      margin-bottom: 1rem;
      max-width: 70%;
    }
    .message-sent {
      margin-left: auto;
      text-align: right;
    }
    .message-received {
      margin-right: auto;
    }
    .message-content {
      padding: 0.8rem;
      border-radius: 18px;
      display: inline-block;
    }
    .message-sent .message-content {
      background: #0066ff;
      color: white;
      border-bottom-right-radius: 5px;
    }
    .message-received .message-content {
      background: #f1f1f1;
      border-bottom-left-radius: 5px;
    }
    .message-time {
      font-size: 0.75rem;
      color: #666;
      text-align: right;
      margin-top: 0.25rem;
    }
    @media (max-width: 768px) {
      .container { 
        padding: 0 15px; 
      }
      .header { 
        flex-direction: column; 
        align-items: flex-start; 
        gap: 15px; 
      }
      .header-right { 
        width: 100%; 
        justify-content: space-between; 
      }
      .pagination { 
        flex-direction: column; 
        align-items: center; 
      }
      .pagination a { 
        margin: 5px 0; 
      }
      .user-actions {
        flex-direction: column;
        gap: 5px;
      }
    }
  `;
}

// ======================
// 路由分发
// ======================

export default {
  async fetch(request, env) {
    // 初始化系统管理员
    await initSystemAdmin(env);
    
    // 获取当前用户
    const user = await getSessionUser(request, env);
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    try {
      // 静态资源
      if (path === '/default-avatar.png') {
        return new Response(defaultAvatar, { 
          headers: { 'Content-Type': 'image/png' } 
        });
      }
      
      // 首页
      if (path === '/' && method === 'GET') {
        return handleHome(request, env, user);
      }
      
      // 登录
      if (path === '/login' && method === 'GET') {
        return handleLoginPage(request, env, user);
      }
      if (path === '/login' && method === 'POST') {
        return handleLoginSubmit(request, env);
      }
      
      // 注册
      if (path === '/register' && method === 'GET') {
        return handleRegisterPage(request, env, user);
      }
      if (path === '/register' && method === 'POST') {
        return handleRegisterSubmit(request, env);
      }
      
      // 退出登录
      if (path === '/logout' && method === 'GET') {
        const cookie = request.headers.get('Cookie') || '';
        const tokenMatch = cookie.match(/session=([^;]+)/);
        if (tokenMatch) {
          await destroySession(tokenMatch[1], env);
        }
        const response = Response.redirect('/', 302);
        response.headers.set('Set-Cookie', 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
        return response;
      }
      
      // 发帖
      if (path === '/post' && method === 'GET') {
        return handlePostPage(request, env, user);
      }
      if (path === '/post' && method === 'POST') {
        return handlePostSubmit(request, env, user);
      }
      
      // 文章详情
      if (/^\/post\/[a-zA-Z0-9-]+$/.test(path) && method === 'GET') {
        const id = path.split('/').pop();
        return handlePostDetail(request, env, user, id);
      }
      
      // 评论
      if (/^\/comment\/[a-zA-Z0-9-]+$/.test(path) && method === 'POST') {
        const postId = path.split('/').pop();
        return handleCommentSubmit(request, env, user, postId);
      }
      if (/^\/comment\/delete\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(path) && method === 'POST') {
        const parts = path.split('/');
        const postId = parts[3];
        const commentId = parts[4];
        return handleDeleteComment(request, env, user, postId, commentId);
      }
      
      // 用户详情
      if (/^\/user\/[a-zA-Z0-9_-]+$/.test(path) && method === 'GET') {
        const username = path.split('/').pop();
        return handleUserProfile(request, env, user, username);
      }
      
      // 私信
      if (/^\/message\/[a-zA-Z0-9_-]+$/.test(path) && method === 'GET') {
        const toUser = path.split('/').pop();
        return handleMessagePage(request, env, user, toUser);
      }
      if (/^\/message\/send\/[a-zA-Z0-9_-]+$/.test(path) && method === 'POST') {
        const toUser = path.split('/').pop();
        return handleSendMessage(request, env, user, toUser);
      }
      
      // RSS
      if (path === '/rss' && method === 'GET') {
        return handleRSS(request, env);
      }
      
      // 用户设置
      if (path === '/settings' && method === 'GET') {
        return handleUserSettings(request, env, user);
      }
      if (path === '/settings/profile' && method === 'POST') {
        if (!(await checkCsrfToken(request, user, env))) {
          return new Response('无效的CSRF令牌', { status: 403 });
        }
        
        const formData = await request.formData();
        const updates = {
          nickname: formData.get('nickname'),
          bio: formData.get('bio'),
          gender: formData.get('gender'),
          avatar: formData.get('avatar')
        };
        
        try {
          await updateUser(user.username, updates, env);
          return Response.redirect('/settings?success=个人信息已更新', 302);
        } catch (error) {
          return Response.redirect(`/settings?error=${encodeURIComponent(error.message)}`, 302);
        }
      }
      if (path === '/settings/password' && method === 'POST') {
        if (!(await checkCsrfToken(request, user, env))) {
          return new Response('无效的CSRF令牌', { status: 403 });
        }
        
        const formData = await request.formData();
        const currentPassword = formData.get('current_password');
        const newPassword = formData.get('new_password');
        const confirmPassword = formData.get('confirm_password');
        
        try {
          // 验证当前密码
          if (!await verifyPassword(currentPassword, user.password_hash)) {
            throw new Error('当前密码错误');
          }
          
          // 验证新密码
          if (newPassword !== confirmPassword) {
            throw new Error('新密码不匹配');
          }
          
          if (!isValidPassword(newPassword)) {
            throw new Error('密码强度不足');
          }
          
          // 更新密码
          await updateUser(user.username, { password: newPassword }, env);
          return Response.redirect('/settings?success=密码已更新', 302);
        } catch (error) {
          return Response.redirect(`/settings?error=${encodeURIComponent(error.message)}`, 302);
        }
      }
      if (path === '/settings/deactivate' && method === 'POST') {
        if (!(await checkCsrfToken(request, user, env))) {
          return new Response('无效的CSRF令牌', { status: 403 });
        }
        
        const formData = await request.formData();
        const password = formData.get('password');
        
        try {
          // 验证密码
          if (!await verifyPassword(password, user.password_hash)) {
            throw new Error('密码错误');
          }
          
          // 删除用户
          await env.BLOG_DATA_STORE.delete(`user:${user.username}`);
          
          // 删除会话
          const cookie = request.headers.get('Cookie') || '';
          const tokenMatch = cookie.match(/session=([^;]+)/);
          if (tokenMatch) {
            await destroySession(tokenMatch[1], env);
          }
          
          const response = Response.redirect('/', 302);
          response.headers.set('Set-Cookie', 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
          return response;
        } catch (error) {
          return Response.redirect(`/settings?error=${encodeURIComponent(error.message)}`, 302);
        }
      }
      
      // 管理面板
      if (path === '/admin' && method === 'GET') {
        if (!user || !user.is_system_admin) return new Response('Forbidden', { status: 403 });
        return handleAdminDashboard(request, env, user);
      }
      
      // 管理操作
      if (path === '/admin/ban' && method === 'POST') {
        if (!user || !user.is_system_admin) return new Response('Forbidden', { status: 403 });
        if (!(await checkCsrfToken(request, user, env))) return new Response('无效的CSRF令牌', { status: 403 });
        
        const formData = await request.formData();
        const username = formData.get('username');
        const targetUser = await getUser(username, env);
        
        if (!targetUser || targetUser.username === SYSTEM_ADMIN_USERNAME) {
          return new Response('无效的用户', { status: 400 });
        }
        
        targetUser.is_banned = !targetUser.is_banned;
        await env.BLOG_DATA_STORE.put(`user:${username}`, JSON.stringify(targetUser));
        
        return Response.redirect(`/user/${escapeHtml(username)}`, 302);
      }
      
      if (path === '/admin/silence' && method === 'POST') {
        if (!user || !user.is_system_admin) return new Response('Forbidden', { status: 403 });
        if (!(await checkCsrfToken(request, user, env))) return new Response('无效的CSRF令牌', { status: 403 });
        
        const formData = await request.formData();
        const username = formData.get('username');
        const targetUser = await getUser(username, env);
        
        if (!targetUser || targetUser.username === SYSTEM_ADMIN_USERNAME) {
          return new Response('无效的用户', { status: 400 });
        }
        
        targetUser.is_silenced = !targetUser.is_silenced;
        await env.BLOG_DATA_STORE.put(`user:${username}`, JSON.stringify(targetUser));
        
        return Response.redirect(`/user/${escapeHtml(username)}`, 302);
      }
      
      if (path === '/admin/promote' && method === 'POST') {
        if (!user || !user.is_system_admin) return new Response('Forbidden', { status: 403 });
        if (!(await checkCsrfToken(request, user, env))) return new Response('无效的CSRF令牌', { status: 403 });
        
        const formData = await request.formData();
        const username = formData.get('username');
        const targetUser = await getUser(username, env);
        
        if (!targetUser || targetUser.username === SYSTEM_ADMIN_USERNAME) {
          return new Response('无效的用户', { status: 400 });
        }
        
        targetUser.role = targetUser.role === 'admin' ? 'user' : 'admin';
        targetUser.title = targetUser.role === 'admin' ? '管理员' : '注册会员';
        await env.BLOG_DATA_STORE.put(`user:${username}`, JSON.stringify(targetUser));
        
        return Response.redirect(`/user/${escapeHtml(username)}`, 302);
      }
      
      if (path === '/admin/reset' && method === 'POST') {
        if (!user || !user.is_system_admin) return new Response('Forbidden', { status: 403 });
        if (!(await checkCsrfToken(request, user, env))) return new Response('无效的CSRF令牌', { status: 403 });
        
        const formData = await request.formData();
        const username = formData.get('username');
        await resetUserPassword(username, 'reset123', env);
        
        return Response.redirect(`/user/${escapeHtml(username)}`, 302);
      }
      
      if (path === '/admin/logout' && method === 'POST') {
        if (!user || !user.is_system_admin) return new Response('Forbidden', { status: 403 });
        if (!(await checkCsrfToken(request, user, env))) return new Response('无效的CSRF令牌', { status: 403 });
        
        const formData = await request.formData();
        const username = formData.get('username');
        const targetUser = await getUser(username, env);
        
        if (!targetUser || targetUser.username === SYSTEM_ADMIN_USERNAME) {
          return new Response('无效的用户', { status: 400 });
        }
        
        // 删除所有会话
        await destroyAllUserSessions(username, env);
        
        return Response.redirect(`/user/${escapeHtml(username)}`, 302);
      }
      
      if (path === '/admin/invite' && method === 'POST') {
        if (!user || !user.is_system_admin) return new Response('Forbidden', { status: 403 });
        if (!(await checkCsrfToken(request, user, env))) return new Response('无效的CSRF令牌', { status: 403 });
        
        const formData = await request.formData();
        const inviteCode = formData.get('invite_code');
        await updateInviteCode(inviteCode, env);
        
        return Response.redirect('/admin', 302);
      }
      
      if (path === '/admin/title/create' && method === 'POST') {
        if (!user || !user.is_system_admin) return new Response('Forbidden', { status: 403 });
        if (!(await checkCsrfToken(request, user, env))) return new Response('无效的CSRF令牌', { status: 403 });
        
        const formData = await request.formData();
        const name = formData.get('name');
        const style = formData.get('style');
        
        await createTitle({ name, style }, env);
        return Response.redirect('/settings', 302);
      }
      
      if (path === '/admin/title/delete' && method === 'POST') {
        if (!user || !user.is_system_admin) return new Response('Forbidden', { status: 403 });
        if (!(await checkCsrfToken(request, user, env))) return new Response('无效的CSRF令牌', { status: 403 });
        
        const formData = await request.formData();
        const titleId = formData.get('title_id');
        
        await deleteTitle(titleId, env);
        return Response.redirect('/settings', 302);
      }
      
      if (path === '/admin/post/delete' && method === 'POST') {
        if (!user || !user.is_system_admin) return new Response('Forbidden', { status: 403 });
        if (!(await checkCsrfToken(request, user, env))) return new Response('无效的CSRF令牌', { status: 403 });
        
        const formData = await request.formData();
        const postId = formData.get('post_id');
        
        await deletePost(postId, env);
        return Response.redirect('/admin', 302);
      }
      
      // 默认404
      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('请求处理错误:', error);
      return new Response(`服务器内部错误: ${error.message}`, { status: 500 });
    }
  }
};

// 默认头像 (PNG base64)
const defaultAvatar = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAAAkCAYAAABdiU5dAAAACXBIWXMAAAsTAAALEwEAmpwYAAAB' +
  'NklEQVR4nO3YsQmDMBBF0T8lKqQgBdJQwQW5IAdyQQ7kgBxIIQUpSEFKQcBdZmY3yQ+8wCZv' +
  '3sOQzExmZjPb7Xa73W73j3pLcZriNMVpiuM4juM4juM4juM4juM4juM4juM4juM4juM4juM4' +
  'juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4' +
  'juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4' +
  'juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4' +
  'juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4' +
  'juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4' +
  'juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4' +
  'juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4' +
  'juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4' +
  'juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4juM4' +
  'juM4juM4juM4juM4juM4juM4juM4ju......<think>