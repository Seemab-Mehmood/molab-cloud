const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { logAudit } = require('./sharedAudit');

function authorInfo(memberId) {
  const m = db.prepare('SELECT full_name, molab_id, hospital_id FROM members WHERE id = ?').get(memberId);
  if (!m) return { fullName: 'Former member', hospitalName: null };
  const h = db.prepare('SELECT name, country FROM hospitals WHERE id = ?').get(m.hospital_id);
  return { fullName: m.full_name, molabId: m.molab_id, hospitalName: h ? `${h.name}, ${h.country}` : null };
}

function listPosts(req, res) {
  const posts = db.prepare('SELECT * FROM community_posts ORDER BY created_at DESC').all();
  const out = posts.map((p) => {
    const commentCount = db.prepare('SELECT COUNT(*) AS c FROM community_comments WHERE post_id = ?').get(p.id).c;
    const likeCount = db.prepare("SELECT COUNT(*) AS c FROM community_reactions WHERE post_id = ? AND type = 'like'").get(p.id).c;
    const likedByMe = !!db.prepare("SELECT 1 FROM community_reactions WHERE post_id = ? AND member_id = ? AND type = 'like'").get(p.id, req.member.id);
    return {
      id: p.id, title: p.title, body: p.body, createdAt: p.created_at,
      author: authorInfo(p.member_id), commentCount, likeCount, likedByMe,
      isMine: p.member_id === req.member.id,
    };
  });
  res.json({ posts: out });
}

function createPost(req, res) {
  const { title, body } = req.body || {};
  if (!title || !title.trim() || !body || !body.trim()) {
    return res.status(400).json({ error: 'A title and message are required.' });
  }
  const id = 'post_' + uuidv4();
  db.prepare('INSERT INTO community_posts (id, member_id, title, body, created_at) VALUES (?,?,?,?,?)')
    .run(id, req.member.id, title.trim().slice(0, 200), body.trim().slice(0, 5000), new Date().toISOString());
  logAudit('member', req.member.id, 'community.post_created', title.trim().slice(0, 80));
  res.status(201).json({ id });
}

function getPost(req, res) {
  const p = db.prepare('SELECT * FROM community_posts WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Post not found.' });
  const comments = db.prepare('SELECT * FROM community_comments WHERE post_id = ? ORDER BY created_at ASC').all(p.id);
  const likeCount = db.prepare("SELECT COUNT(*) AS c FROM community_reactions WHERE post_id = ? AND type = 'like'").get(p.id).c;
  const likedByMe = !!db.prepare("SELECT 1 FROM community_reactions WHERE post_id = ? AND member_id = ? AND type = 'like'").get(p.id, req.member.id);
  res.json({
    post: {
      id: p.id, title: p.title, body: p.body, createdAt: p.created_at,
      author: authorInfo(p.member_id), likeCount, likedByMe, isMine: p.member_id === req.member.id,
      comments: comments.map((c) => ({
        id: c.id, body: c.body, createdAt: c.created_at,
        author: authorInfo(c.member_id), isMine: c.member_id === req.member.id,
      })),
    },
  });
}

function addComment(req, res) {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment cannot be empty.' });
  const post = db.prepare('SELECT id FROM community_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const id = 'cmt_' + uuidv4();
  db.prepare('INSERT INTO community_comments (id, post_id, member_id, body, created_at) VALUES (?,?,?,?,?)')
    .run(id, post.id, req.member.id, body.trim().slice(0, 2000), new Date().toISOString());
  logAudit('member', req.member.id, 'community.comment_created', post.id);
  res.status(201).json({ id });
}

function toggleReaction(req, res) {
  const post = db.prepare('SELECT id FROM community_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const type = 'like';
  const existing = db.prepare('SELECT id FROM community_reactions WHERE post_id = ? AND member_id = ? AND type = ?').get(post.id, req.member.id, type);
  if (existing) {
    db.prepare('DELETE FROM community_reactions WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO community_reactions (id, post_id, member_id, type, created_at) VALUES (?,?,?,?,?)')
      .run('rxn_' + uuidv4(), post.id, req.member.id, type, new Date().toISOString());
  }
  const likeCount = db.prepare("SELECT COUNT(*) AS c FROM community_reactions WHERE post_id = ? AND type = 'like'").get(post.id).c;
  res.json({ liked: !existing, likeCount });
}

module.exports = { listPosts, createPost, getPost, addComment, toggleReaction };
