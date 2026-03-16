# AI Visibility Audit — Deployment Guide

## What You're Deploying
A complete AI Visibility Audit web app that lets users:
1. Visit a landing page and enter their website URL
2. Get an AI Visibility Score with category breakdowns
3. See 3 free recommendations (teaser)
4. Sign up to unlock the full report, all recommendations, and page-by-page analysis
5. Access a dashboard with audit history

## Prerequisites
- A GitHub account (free)
- A Supabase account (free tier works fine)
- A Vercel account (free tier works fine)

---

## Step 1: Push Code to GitHub

1. Go to https://github.com/new
2. Create a new repository (e.g., "ai-visibility-audit")
3. Make it **Private** if you prefer
4. Don't add a README (we already have one)
5. Follow the instructions to push your local code:

```bash
cd ai-visibility-audit
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ai-visibility-audit.git
git push -u origin main
```

---

## Step 2: Set Up Supabase

1. Go to https://supabase.com and sign up / sign in
2. Click **"New Project"**
3. Choose a name (e.g., "ai-visibility-audit")
4. Set a **database password** — save this somewhere safe
5. Choose a region close to your users (e.g., East US)
6. Click **"Create new project"** and wait ~2 minutes

### Run the Database Schema

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Copy the ENTIRE contents of `supabase-schema.sql` from this project
4. Paste it into the SQL editor
5. Click **"Run"** (or Cmd/Ctrl+Enter)
6. You should see "Success. No rows returned" — that's correct

### Get Your API Keys

1. Go to **Settings** → **API** (left sidebar)
2. Copy these two values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)

### Configure Auth

1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your Vercel URL (you'll update this after deploying):
   - For now, use: `http://localhost:3000`
3. Under **Redirect URLs**, add:
   - `http://localhost:3000/auth/callback`
   - `https://your-app-name.vercel.app/auth/callback` (update after deploy)

---

## Step 3: Deploy to Vercel

1. Go to https://vercel.com and sign up / sign in
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Before clicking Deploy, add **Environment Variables**:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `NEXT_PUBLIC_APP_URL` | `https://your-app-name.vercel.app` |

5. Click **"Deploy"**
6. Wait for the build to complete (~2 minutes)

### After First Deploy

1. Copy your Vercel URL (e.g., `https://ai-visibility-audit.vercel.app`)
2. Go back to Supabase → **Authentication** → **URL Configuration**
3. Update **Site URL** to your Vercel URL
4. Add `https://your-vercel-url.vercel.app/auth/callback` to Redirect URLs

---

## Step 4: Test Everything

1. **Landing page**: Visit your Vercel URL — you should see the marketing page
2. **Run an audit**: Enter a URL like `stripe.com` and click "Run Audit"
3. **View results**: You should see a score and 3 recommendations
4. **Sign up gate**: Below the 3 free recommendations, you should see a "Sign up to unlock" prompt
5. **Sign up**: Create an account — check your email for confirmation
6. **Full report**: After confirming, the full report should unlock
7. **Dashboard**: Visit /dashboard to see your audit history

---

## Troubleshooting

**"Failed to create site record" error**
→ Your Supabase schema wasn't applied. Go to SQL Editor and re-run the schema.

**Auth not working**
→ Check that your Site URL and Redirect URLs match your deployed URL exactly in Supabase Auth settings.

**Scan fails on a site**
→ Some sites block server-side requests or have aggressive rate limiting. This is expected for certain sites. Try a well-known SaaS site first.

**Build fails on Vercel**
→ Check that all three environment variables are set correctly. The build needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.

---

## Optional: Add a Custom Domain

1. In Vercel, go to your project → **Settings** → **Domains**
2. Add your domain
3. Update DNS records as instructed
4. Update Supabase Auth URL Configuration with your new domain
5. Update `NEXT_PUBLIC_APP_URL` in Vercel environment variables

---

## What's Next

After shipping v1, the recommended next steps are:

1. **Add Stripe for paid audits** — gate full reports behind a one-time payment
2. **Add a lightweight monitoring snippet** — track AI crawler visits
3. **Add re-scan comparison** — show how scores change over time
4. **Add email reports** — send audit results via email using Resend
5. **Add team/org support** — let multiple users share audits

The app is architected to support all of these without major refactoring.
