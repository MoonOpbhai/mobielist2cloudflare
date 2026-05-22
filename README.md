# MoonList — Cloudflare Pages Deploy Guide

## Project Structure
```
mobielist2/
├── public/
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── config.js        ← placeholder (GitHub Action fill karega)
├── .github/
│   └── workflows/
│       └── deploy.yml   ← auto deploy
├── schema.sql           ← Supabase DB setup
└── .gitignore
```

---

## STEP 1 — Supabase Setup

1. **supabase.com** → Login → **New Project** banao
2. Project ban jane ke baad:
   - Left sidebar → **SQL Editor**
   - `schema.sql` file ka sara content paste karo → **Run**
3. Keys lene ke liye:
   - Left sidebar → **Project Settings** → **API**
   - Copy karo:
     - `Project URL` → yeh tumhara **SUPABASE_URL** hai
     - `anon / public` key → yeh tumhara **SUPABASE_ANON_KEY** hai

---

## STEP 2 — Cloudflare Setup

### 2a. Cloudflare Account ID lao
1. **dash.cloudflare.com** → Login
2. Right sidebar mein **Account ID** dikhega → copy karo

### 2b. Cloudflare API Token banao
1. dash.cloudflare.com → Top right **profile icon** → **My Profile**
2. **API Tokens** tab → **Create Token**
3. **"Edit Cloudflare Workers"** template choose karo
4. Permissions mein **Add** karo:
   - `Cloudflare Pages` → `Edit`
5. **Continue to summary** → **Create Token**
6. Token copy karo (sirf ek baar dikhega)

### 2c. Cloudflare Pages Project banao
1. dash.cloudflare.com → **Workers & Pages** → **Create**
2. **Pages** tab → **"Create directly"** (Connect to Git wala mat karo)
3. Project name daalo: **`mobielist2`** (exactly yahi naam, deploy.yml se match karna chahiye)
4. **Save**

---

## STEP 3 — GitHub Secrets add karo

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Yeh 4 secrets add karo:

| Secret Name | Value |
|---|---|
| `CF_API_TOKEN` | Cloudflare API token (Step 2b se) |
| `CF_ACCOUNT_ID` | Cloudflare Account ID (Step 2a se) |
| `SUPABASE_URL` | Supabase Project URL (Step 1 se) |
| `SUPABASE_ANON_KEY` | Supabase anon key (Step 1 se) |

---

## STEP 4 — GitHub pe push karo

```bash
git init
git add .
git commit -m "initial deploy"
git branch -M main
git remote add origin https://github.com/MoonOpbhai/mobielist2.git
git push -u origin main
```

Push hote hi GitHub Action automatically:
1. Supabase keys `config.js` mein inject karega
2. `public/` folder Cloudflare Pages pe deploy karega

---

## STEP 5 — Live URL

Deploy hone ke baad:
- **dash.cloudflare.com → Workers & Pages → mobielist2**
- URL milega: `https://mobielist2.pages.dev`

---

## Admin Password
App mein admin unlock karne ke liye password: `Amonchand111`
(Change karna ho to `app.js` mein `Amonchand111` dhundho)
