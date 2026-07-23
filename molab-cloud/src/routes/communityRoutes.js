const express = require('express');
const { requireMemberAuth, requireActiveMembership } = require('../middleware/auth');
const ctrl = require('../controllers/communityController');

const router = express.Router();
router.use(requireMemberAuth);

// Reading the board stays open even to locked members. Posting/replying
// requires an active membership.
router.get('/posts', ctrl.listPosts);
router.get('/posts/:id', ctrl.getPost);
router.post('/posts', requireActiveMembership, ctrl.createPost);
router.post('/posts/:id/comments', requireActiveMembership, ctrl.addComment);
router.post('/posts/:id/react', requireActiveMembership, ctrl.toggleReaction);

module.exports = router;
