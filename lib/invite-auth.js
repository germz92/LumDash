const crypto = require('crypto');

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function appBaseUrl() {
  return String(process.env.APP_URL || 'https://www.lumdash.app').replace(/\/$/, '');
}

function inviteUrl(token) {
  return `${appBaseUrl()}/accept-invite.html?token=${encodeURIComponent(token)}`;
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function publicInvite(invite) {
  return {
    _id: invite._id,
    email: invite.email,
    fullName: invite.fullName,
    role: invite.role,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt
  };
}

async function sendInviteEmail(sgMail, invite) {
  const url = inviteUrl(invite.token);
  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!process.env.SENDGRID_API_KEY || !from) {
    return { sent: false, url, error: 'Email is not configured' };
  }

  const name = invite.fullName || 'there';
  try {
    await sgMail.send({
      to: invite.email,
      from,
      subject: 'You’re invited to LumDash',
      text: `Hi ${name},\n\nYou’ve been invited to LumDash. Open this link to create your account:\n${url}\n\nThis link expires in 7 days.`,
      html: `<p>Hi ${name},</p><p>You’ve been invited to LumDash.</p><p><a href="${url}">Accept your invite</a></p><p>This link expires in 7 days. If you weren’t expecting this, you can ignore it.</p>`
    });
    return { sent: true, url };
  } catch (err) {
    console.error('Invite email failed:', err.message);
    return { sent: false, url, error: 'Could not send the invite email' };
  }
}

function registerInviteAuth(app, { User, Invite, authenticate, sgMail, io, bcrypt }) {
  function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    next();
  }

  app.post('/api/auth/register', (req, res) => {
    res.status(403).json({ error: 'LumDash is invite only. Ask an admin for an invite.' });
  });

  app.get('/api/auth/invite/:token', async (req, res) => {
    try {
      const invite = await Invite.findOne({ token: req.params.token, acceptedAt: null });
      if (!invite || invite.expiresAt < new Date()) {
        return res.status(400).json({ error: 'This invite link is invalid or has expired.' });
      }
      const existing = await User.findOne({ email: invite.email });
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
      }
      res.json({
        email: invite.email,
        fullName: invite.fullName
      });
    } catch (err) {
      console.error('Invite lookup failed:', err);
      res.status(500).json({ error: 'Could not load this invite' });
    }
  });

  app.post('/api/auth/accept-invite', async (req, res) => {
    try {
      const token = String(req.body.token || '').trim();
      const fullName = String(req.body.fullName || '').trim();
      const password = String(req.body.password || '');

      if (!token) return res.status(400).json({ error: 'Invite token is required' });
      if (!fullName) return res.status(400).json({ error: 'Name is required' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

      const invite = await Invite.findOne({ token, acceptedAt: null });
      if (!invite || invite.expiresAt < new Date()) {
        return res.status(400).json({ error: 'This invite link is invalid or has expired.' });
      }

      const existing = await User.findOne({ email: invite.email });
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
      }

      const hashed = await bcrypt.hash(password, 10);
      const user = new User({
        email: invite.email,
        password: hashed,
        fullName,
        role: invite.role === 'admin' ? 'admin' : 'user'
      });
      await user.save();

      invite.acceptedAt = new Date();
      invite.token = newToken();
      await invite.save();

      if (io) io.emit('usersChanged');
      res.json({ message: 'Account created. You can sign in now.' });
    } catch (err) {
      console.error('Accept invite failed:', err);
      if (err && err.code === 11000) {
        return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
      }
      res.status(500).json({ error: 'Could not create the account' });
    }
  });

  app.get('/api/invites', authenticate, requireAdmin, async (req, res) => {
    try {
      const invites = await Invite.find({ acceptedAt: null }).sort({ createdAt: -1 });
      res.json(invites.map(publicInvite));
    } catch (err) {
      console.error('List invites failed:', err);
      res.status(500).json({ error: 'Could not load invites' });
    }
  });

  app.post('/api/invites', authenticate, requireAdmin, async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const fullName = String(req.body.fullName || '').trim();
      const role = req.body.role === 'admin' ? 'admin' : 'user';

      if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
      if (!fullName) return res.status(400).json({ error: 'Name is required' });

      const existingUser = await User.findOne({ email });
      if (existingUser) return res.status(409).json({ error: 'That email already has an account' });

      let invite = await Invite.findOne({ email, acceptedAt: null });
      if (invite) {
        invite.fullName = fullName;
        invite.role = role;
        invite.token = newToken();
        invite.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
        invite.invitedBy = req.user.id;
      } else {
        invite = new Invite({
          email,
          fullName,
          role,
          token: newToken(),
          invitedBy: req.user.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS)
        });
      }
      await invite.save();

      const mail = await sendInviteEmail(sgMail, invite);
      res.json({
        message: mail.sent ? 'Invite sent' : 'Invite saved, but the email could not be sent',
        emailSent: mail.sent,
        acceptUrl: mail.sent ? undefined : mail.url,
        invite: publicInvite(invite)
      });
    } catch (err) {
      console.error('Create invite failed:', err);
      res.status(500).json({ error: 'Could not send the invite' });
    }
  });

  app.post('/api/invites/:id/resend', authenticate, requireAdmin, async (req, res) => {
    try {
      const invite = await Invite.findOne({ _id: req.params.id, acceptedAt: null });
      if (!invite) return res.status(404).json({ error: 'Invite not found' });

      const existingUser = await User.findOne({ email: invite.email });
      if (existingUser) return res.status(409).json({ error: 'That email already has an account' });

      invite.token = newToken();
      invite.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      await invite.save();

      const mail = await sendInviteEmail(sgMail, invite);
      res.json({
        message: mail.sent ? 'Invite resent' : 'Invite refreshed, but the email could not be sent',
        emailSent: mail.sent,
        acceptUrl: mail.sent ? undefined : mail.url,
        invite: publicInvite(invite)
      });
    } catch (err) {
      console.error('Resend invite failed:', err);
      res.status(500).json({ error: 'Could not resend the invite' });
    }
  });

  app.delete('/api/invites/:id', authenticate, requireAdmin, async (req, res) => {
    try {
      const invite = await Invite.findOneAndDelete({ _id: req.params.id, acceptedAt: null });
      if (!invite) return res.status(404).json({ error: 'Invite not found' });
      res.json({ message: 'Invite revoked' });
    } catch (err) {
      console.error('Revoke invite failed:', err);
      res.status(500).json({ error: 'Could not revoke the invite' });
    }
  });
}

module.exports = registerInviteAuth;
