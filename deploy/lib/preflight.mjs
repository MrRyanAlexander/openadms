/**
 * Tool preflight.
 *
 * Nothing here assumes a CLI is installed or that you are signed in. For every
 * tool a target needs: check it, explain what it is for, offer to install it,
 * verify the install took, then check authentication and offer to run the
 * login flow. Control returns to the caller in the same place either way.
 */
import process from 'node:process'
import { ask, c, capture, cmdEcho, confirm, fail, has, isInteractive, note, ok, run, say, step, unattendedMode, warn } from './cli.mjs'

const mac = process.platform === 'darwin'
const linux = process.platform === 'linux'

export const TOOLS = {
  node: {
    label: 'Node.js 18+',
    why: 'Builds both frontends and runs this installer.',
    check: () => {
      if (!has('node')) return { ok: false }
      const v = capture('node', ['--version'])
      const major = Number((v.stdout || '').replace(/^v/, '').split('.')[0])
      return { ok: major >= 18, version: v.stdout, detail: major < 18 ? `found ${v.stdout}, need 18+` : null }
    },
    install: mac ? 'brew install node' : 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs',
    manual: 'https://nodejs.org/en/download',
  },

  git: {
    label: 'Git',
    why: 'Railway uploads your working tree; Netlify links deploys to a commit.',
    check: () => ({ ok: has('git'), version: capture('git', ['--version']).stdout }),
    install: mac ? 'brew install git' : 'sudo apt-get install -y git',
    manual: 'https://git-scm.com/downloads',
  },

  psql: {
    label: 'psql (PostgreSQL client)',
    why: 'Runs the migrations and the schema test suite against your database.',
    check: () => ({ ok: has('psql'), version: capture('psql', ['--version']).stdout }),
    install: mac ? 'brew install libpq && brew link --force libpq'
                 : 'sudo apt-get install -y postgresql-client',
    manual: 'https://www.postgresql.org/download/',
    postInstallNote: mac
      ? 'Homebrew keeps libpq unlinked by default, which is why the link step is there.'
      : null,
  },

  railway: {
    label: 'Railway CLI',
    why: 'Creates the project, provisions Postgres, and deploys the API container.',
    check: () => ({ ok: has('railway'), version: capture('railway', ['--version']).stdout }),
    install: mac ? 'brew install railway' : 'npm install -g @railway/cli',
    installAlt: 'npm install -g @railway/cli',
    manual: 'https://docs.railway.com/guides/cli',
    auth: {
      check: () => {
        const r = capture('railway', ['whoami'], { timeout: 20000 })
        return { ok: r.ok, who: r.stdout }
      },
      login: ['railway', ['login']],
      loginNote: 'This opens a browser. If you are on a headless machine run '
                 + '`railway login --browserless` instead.',
    },
  },

  gh: {
    label: 'GitHub CLI',
    why: 'Pushes the code to GitHub so Railway can pull and build it.',
    check: () => ({ ok: has('gh'), version: capture('gh', ['--version']).stdout.split('\n')[0] }),
    install: mac ? 'brew install gh' : 'sudo apt-get install -y gh',
    installAlt: 'gh is available at https://cli.github.com',
    manual: 'https://cli.github.com',
    auth: {
      check: () => {
        const r = capture('gh', ['auth', 'status'], { timeout: 20000 })
        // gh auth status exits 0 only when authenticated
        const text = `${r.stdout}\n${r.stderr}`
        const who = text.match(/Logged in to \S+ account (\S+)/)?.[1]
          || text.match(/✓ Logged in to github\.com as (\S+)/)?.[1]
        return { ok: r.ok, who }
      },
      login: ['gh', ['auth', 'login']],
      loginNote: 'This opens a browser. On a headless machine run `gh auth login --web` or `gh auth login --with-token`.',
    },
  },

  netlify: {
    label: 'Netlify CLI',
    why: 'Creates both sites and pushes the built frontends.',
    check: () => ({ ok: has('netlify'), version: capture('netlify', ['--version']).stdout.split('\n')[0] }),
    install: 'npm install -g netlify-cli',
    manual: 'https://docs.netlify.com/cli/get-started/',
    auth: {
      /**
       * `netlify status` reports on the *linked project*, so in an unlinked
       * folder it errors even when you are perfectly well signed in. Ask the
       * API who we are instead: that answer does not depend on the directory.
       *
       * Both commands exit 0 whatever happens, so the content is what counts,
       * not the status code. netlify-cli 27 added a structured `status --json`;
       * 23 did not, hence the two-step.
       */
      check: () => {
        const me = capture('netlify', ['api', 'getCurrentUser', '--data', '{}'],
                           { timeout: 30000 })
        const body = `${me.stdout}\n${me.stderr}`
        if (!/Forbidden|Unauthorized|not logged in/i.test(body)) {
          try {
            const start = me.stdout.indexOf('{')
            const parsed = start === -1 ? null : JSON.parse(me.stdout.slice(start))
            if (parsed?.email || parsed?.id) {
              return { ok: true, who: parsed.email || parsed.full_name || parsed.id }
            }
          } catch { /* fall through to status */ }
        }

        const status = capture('netlify', ['status', '--json'], { timeout: 30000 })
        try {
          const parsed = JSON.parse(status.stdout)
          if (parsed?.loggedIn === true) {
            return { ok: true, who: parsed?.user?.email || parsed?.account?.[0]?.slug }
          }
          if (parsed?.loggedIn === false) return { ok: false }
        } catch { /* older CLI prints prose */ }

        // netlify-cli 23 prints the account block as text and then complains
        // about linkage. Seeing the account block at all means we are signed in.
        const plain = capture('netlify', ['status'], { timeout: 30000 })
        const text = `${plain.stdout}\n${plain.stderr}`
        if (/Not logged in|Please log in/i.test(text)) return { ok: false }
        const email = text.match(/Email:\s*(\S+)/)
        if (email || /Current Netlify User/i.test(text)) {
          return { ok: true, who: email?.[1] }
        }
        return { ok: false }
      },
      login: ['netlify', ['login']],
      loginNote: 'This opens a browser to authorise the CLI. If it says you are '
                 + 'already logged in, you are — this check does not need a linked folder.',
    },
  },

  gcloud: {
    label: 'Google Cloud CLI',
    why: 'Builds the API image and deploys Cloud Run and Cloud SQL.',
    check: () => ({ ok: has('gcloud'), version: capture('gcloud', ['--version']).stdout.split('\n')[0] }),
    install: mac ? 'brew install --cask google-cloud-sdk' : 'See the manual link',
    manual: 'https://cloud.google.com/sdk/docs/install',
    auth: {
      check: () => {
        const r = capture('gcloud', ['auth', 'list', '--filter=status:ACTIVE',
                                     '--format=value(account)'], { timeout: 20000 })
        return { ok: r.ok && Boolean(r.stdout), who: r.stdout }
      },
      login: ['gcloud', ['auth', 'login']],
    },
  },

  aws: {
    label: 'AWS CLI',
    why: 'Pushes the API image to ECR and deploys App Runner, RDS and CloudFront.',
    check: () => ({ ok: has('aws'), version: capture('aws', ['--version']).stdout }),
    install: mac ? 'brew install awscli' : 'sudo apt-get install -y awscli',
    manual: 'https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html',
    auth: {
      check: () => {
        const r = capture('aws', ['sts', 'get-caller-identity', '--output', 'text'],
                          { timeout: 25000 })
        return { ok: r.ok, who: r.stdout.split('\t')[0] }
      },
      login: ['aws', ['configure']],
    },
  },

  docker: {
    label: 'Docker',
    why: 'Builds the API image, and can run Postgres locally.',
    check: () => {
      if (!has('docker')) return { ok: false }
      const info = capture('docker', ['info'], { timeout: 20000 })
      return { ok: info.ok, detail: info.ok ? null : 'installed but the daemon is not running' }
    },
    install: mac ? 'brew install --cask docker' : 'curl -fsSL https://get.docker.com | sh',
    manual: 'https://docs.docker.com/get-docker/',
  },

  terraform: {
    label: 'Terraform',
    why: 'Only needed for the declarative deploy/ stacks.',
    check: () => ({ ok: has('terraform'), version: capture('terraform', ['version']).stdout.split('\n')[0] }),
    install: mac ? 'brew tap hashicorp/tap && brew install hashicorp/tap/terraform'
                 : 'See the manual link',
    manual: 'https://developer.hashicorp.com/terraform/install',
  },
}

export const TARGET_TOOLS = {
  netlify: ['node', 'git', 'gh', 'psql', 'railway', 'netlify'],
  aws: ['node', 'git', 'psql', 'docker', 'aws'],
  gcp: ['node', 'git', 'psql', 'docker', 'gcloud'],
  local: ['node', 'psql'],
}

function brewMissing() {
  return mac && !has('brew')
}

/**
 * Walk the tools a target needs. Returns { ready, missing, skipped } and never
 * throws: the caller decides whether to continue without a tool.
 */
export async function preflight(target, { unattended = false, autoInstall = false } = {}) {
  const quiet = unattended || unattendedMode()
  const names = TARGET_TOOLS[target] || TARGET_TOOLS.local
  step(`Checking the tools the ${target} target needs`)

  const missing = []
  const notAuthed = []

  for (const name of names) {
    const tool = TOOLS[name]
    const state = tool.check()

    if (state.ok) {
      ok(`${tool.label}${state.version ? `  ${c.dim}${state.version}${c.reset}` : ''}`)
      continue
    }

    warn(`${tool.label} is ${state.detail || 'not installed'}`)
    note(tool.why)

    const installCmd = brewMissing() && tool.install.startsWith('brew')
      ? (tool.installAlt || tool.install)
      : tool.install

    if (brewMissing() && tool.install.startsWith('brew') && !tool.installAlt) {
      note('Homebrew is not installed. Install it first:')
      note('  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"')
    }

    note(`Install it with:  ${c.cyan}${installCmd}${c.reset}`)
    note(`Or follow:        ${tool.manual}`)

    const wantsInstall = quiet
      ? autoInstall
      : await confirm('Run that install command now?', true)

    if (wantsInstall) {
      const [bin, ...rest] = installCmd.split(' ')
      const shellNeeded = /[|&><]/.test(installCmd)
      const result = shellNeeded
        ? run('bash', ['-lc', installCmd])
        : run(bin, rest)

      if (!result.ok) {
        fail(`That install command exited ${result.status ?? 'with an error'}.`)
      }
      if (tool.postInstallNote) note(tool.postInstallNote)

      const after = tool.check()
      if (after.ok) {
        ok(`${tool.label} is ready now`)
        continue
      }
      fail(`${tool.label} still is not on PATH.`)
      note('If the install just finished, open a new terminal so PATH refreshes, '
           + 'then run this installer again.')
    }

    missing.push(name)
  }

  if (missing.length) {
    return { ready: false, missing, notAuthed }
  }

  // ---- authentication -----------------------------------------------------
  const needsAuth = names.filter((n) => TOOLS[n].auth)
  if (needsAuth.length) {
    step('Checking you are signed in')
  }

  for (const name of needsAuth) {
    const tool = TOOLS[name]
    const state = tool.auth.check()

    if (state.ok) {
      ok(`${tool.label}${state.who ? `  ${c.dim}${state.who}${c.reset}` : '  signed in'}`)
      continue
    }

    warn(`${tool.label} is not signed in`)
    if (tool.auth.loginNote) note(tool.auth.loginNote)

    const wantsLogin = quiet ? false : await confirm('Sign in now?', true)
    if (wantsLogin) {
      run(...tool.auth.login)
      const after = tool.auth.check()
      if (after.ok) {
        ok(`${tool.label} signed in${after.who ? ` as ${after.who}` : ''}`)
        continue
      }
      fail('Still not signed in.')
    }
    notAuthed.push(name)
  }

  return { ready: missing.length === 0 && notAuthed.length === 0, missing, notAuthed }
}
