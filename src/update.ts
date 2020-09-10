import * as core from '@actions/core'
import {Octokit} from '@octokit/rest'
import fs from 'fs'
import * as cp from 'child_process'
import semver from 'semver'

import {Repository, Checkout, Commit, Signature} from 'nodegit'

/**
 * Proposed/applied update to a dependency.
 */
export class Update {
  constructor(
    public dependency: string,
    public previous: string | null,
    public next: string
  ) {}
}

export class Updater {
  private _repo: Repository | null = null

  constructor(
    private octokit: Octokit,
    private owner: string,
    private repo: string
  ) {}

  /**
   * Check out base branch, enumerate packages.json and propose any available updates.
   * @param baseBranch Base git branch
   */
  async updateAll(baseBranch: string): Promise<void> {
    const packageJSON = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    for (const dep of Object.keys(packageJSON.dependencies)) {
      // Skip non-semver dependencies:
      const currentVersion = semver.clean(
        packageJSON.dependencies[dep].replace(/^\^/, '')
      )
      if (currentVersion === null) {
        continue
      }

      // Query available versions of this package
      const depVersions = this.versions(dep)
      if (!depVersions) {
        continue
      }
      const latestVersion = depVersions[depVersions.length - 1]
      core.info(
        `dependency ${dep} current ${currentVersion}, latest ${latestVersion}`
      )

      // If an update is available, process it:
      if (semver.gt(latestVersion, currentVersion)) {
        try {
          const update = new Update(dep, currentVersion, latestVersion)
          await this.update(baseBranch, update)
        } catch (e) {
          console.error(e)
        }
      }
    }
    // TODO: devDependencies
  }

  /**
   * Updates a dependency version within a branch.
   * @param baseBranch Base git branch
   * @param update Update to apply.
   */
  async update(baseBranch: string, update: Update): Promise<void> {
    core.info(`performing update of ${update.dependency} to ${update.next}`)

    // Reset to base branch and pre-update snapshot:
    const baseCommit = await this.checkoutUpdateBranch(baseBranch, update)
    this.npmCommand(`ls ${update.dependency}`)

    // Perform the update, post-update snapshot:
    this.npmCommand(
      `install --ignore-scripts ${update.dependency}@${update.next}`
    )
    this.npmCommand(`ls ${update.dependency}`)

    // Commit the result to the update branch:
    await this.commitUpdateBranch(baseCommit, update)
    this.pushUpdateBranch(baseBranch, update)
  }

  private async checkoutUpdateBranch(
    baseBranch: string,
    update: Update
  ): Promise<Commit> {
    const targetBranch = this.branchName(baseBranch, update)
    core.debug(`switching to update branch: ${targetBranch}`)
    const repo = await this.gitRepo()
    const baseCommit = await repo.getBranchCommit(baseBranch)
    await repo.createBranch(targetBranch, baseCommit, true)
    await repo.checkoutBranch(targetBranch, {
      checkoutStrategy: Checkout.STRATEGY.FORCE
    })
    return baseCommit
  }

  private branchName(baseBranch: string, update: Update): string {
    return `action-update-npm/${baseBranch}/${update.dependency}/${update.next}`
  }

  private npmCommand(args: string): void {
    const cmd = `npm --no-color ${args}`
    core.debug(`~~~ invoking: ${cmd} ~~~`)
    const cmdOut = cp.execSync(cmd).toString()
    for (const line of cmdOut.split('\n')) {
      core.debug(`  ${line}`)
    }
    core.debug(`~~~ invoked: ${cmd} ~~~`)
  }

  private async commitUpdateBranch(
    baseCommit: Commit,
    update: Update
  ): Promise<void> {
    const repo = await this.gitRepo()
    const index = await repo.index()
    const files = await repo.getStatus()
    for (const f of files) {
      await index.addByPath(f.path())
    }
    index.write()
    const treeOID = await index.writeTree()

    const author = Signature.now('action-update-npm', 'no-reply@github.com')
    const committer = Signature.now('action-update-npm', 'no-reply@github.com')
    const message = `Bump ${update.dependency} to ${update.next}`

    await repo.createCommit('HEAD', author, committer, message, treeOID, [
      baseCommit
    ])
  }

  private pushUpdateBranch(baseBranch: string, update: Update): void {
    // nodegit supports remotes, but we'd have to reconfigure credentials.
    // Let's (ab)use the credentials setup by actions/checkout
    const targetBranch = this.branchName(baseBranch, update)
    cp.execSync(`git push -u origin ${targetBranch}`).toString()
  }

  private async gitRepo(): Promise<Repository> {
    if (!this._repo) {
      const path = process.env.GITHUB_WORKSPACE || '.'
      this._repo = await Repository.open(path)
    }
    return this._repo
  }

  /**
   * List versions of a package, in ascending semver order.
   * @param dependency Package name.
   */
  versions(dependency: string): string[] {
    const npmShow = JSON.parse(
      cp.execSync(`npm show "${dependency}" --json time`).toString()
    )
    const semVersions = Object.keys(npmShow).filter(s => !!semver.valid(s))
    return semver.sort(semVersions)
  }

  /**
   * Stub, we _should_ care about open PRs in the repo eventually right?
   * Wire the octokit.
   */
  async openPRs(): Promise<void> {
    const latestPRs = await this.octokit.pulls.list({
      owner: this.owner,
      repo: this.repo
    })
    console.log(latestPRs.data)
  }
}
