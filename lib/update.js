"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Updater = exports.Update = void 0;
const core = __importStar(require("@actions/core"));
const fs_1 = __importDefault(require("fs"));
const cp = __importStar(require("child_process"));
const semver_1 = __importDefault(require("semver"));
const nodegit_1 = require("nodegit");
/**
 * Proposed/applied update to a dependency.
 */
class Update {
    constructor(dependency, previous, next) {
        this.dependency = dependency;
        this.previous = previous;
        this.next = next;
    }
}
exports.Update = Update;
class Updater {
    constructor(octokit, owner, repo) {
        this.octokit = octokit;
        this.owner = owner;
        this.repo = repo;
        this._repo = null;
    }
    /**
     * Check out base branch, enumerate packages.json and propose any available updates.
     * @param baseBranch Base git branch
     */
    updateAll(baseBranch) {
        return __awaiter(this, void 0, void 0, function* () {
            const packageJSON = JSON.parse(fs_1.default.readFileSync('package.json', 'utf8'));
            for (const dep of Object.keys(packageJSON.dependencies)) {
                // Skip non-semver dependencies:
                const currentVersion = semver_1.default.clean(packageJSON.dependencies[dep].replace(/^\^/, ''));
                if (currentVersion === null) {
                    continue;
                }
                // Query available versions of this package
                const depVersions = this.versions(dep);
                if (!depVersions) {
                    continue;
                }
                const latestVersion = depVersions[depVersions.length - 1];
                core.info(`dependency ${dep} current ${currentVersion}, latest ${latestVersion}`);
                // If an update is available, process it:
                if (semver_1.default.gt(latestVersion, currentVersion)) {
                    try {
                        const update = new Update(dep, currentVersion, latestVersion);
                        yield this.update(baseBranch, update);
                    }
                    catch (e) {
                        console.error(e);
                    }
                }
            }
            // TODO: devDependencies
        });
    }
    /**
     * Updates a dependency version within a branch.
     * @param baseBranch Base git branch
     * @param update Update to apply.
     */
    update(baseBranch, update) {
        return __awaiter(this, void 0, void 0, function* () {
            core.info(`performing update of ${update.dependency} to ${update.next}`);
            // Reset to base branch and pre-update snapshot:
            const baseCommit = yield this.checkoutUpdateBranch(baseBranch, update);
            this.npmCommand(`ls ${update.dependency}`);
            // Perform the update, post-update snapshot:
            this.npmCommand(`install --ignore-scripts ${update.dependency}@${update.next}`);
            this.npmCommand(`ls ${update.dependency}`);
            // Commit the result to the update branch:
            yield this.commitUpdateBranch(baseCommit, update);
            this.pushUpdateBranch();
        });
    }
    checkoutUpdateBranch(baseBranch, update) {
        return __awaiter(this, void 0, void 0, function* () {
            const targetBranch = `action-update-npm/${baseBranch}/${update.dependency}/${update.next}`;
            core.debug(`switching to update branch: ${targetBranch}`);
            const repo = yield this.gitRepo();
            console.log(repo);
            const baseCommit = yield repo.getBranchCommit(baseBranch);
            yield repo.createBranch(targetBranch, baseCommit, true);
            yield repo.checkoutBranch(targetBranch, {
                checkoutStrategy: 2 /* FORCE */
            });
            return baseCommit;
        });
    }
    npmCommand(args) {
        const cmd = `npm --no-color ${args}`;
        core.debug(`~~~ invoking: ${cmd} ~~~`);
        const cmdOut = cp.execSync(cmd).toString();
        for (const line of cmdOut.split('\n')) {
            core.debug(`  ${line}`);
        }
        core.debug(`~~~ invoked: ${cmd} ~~~`);
    }
    commitUpdateBranch(baseCommit, update) {
        return __awaiter(this, void 0, void 0, function* () {
            const repo = yield this.gitRepo();
            const index = yield repo.index();
            const files = yield repo.getStatus();
            for (const f of files) {
                yield index.addByPath(f.path());
            }
            index.write();
            const treeOID = yield index.writeTree();
            const author = nodegit_1.Signature.now('action-update-npm', 'no-reply@github.com');
            const committer = nodegit_1.Signature.now('action-update-npm', 'no-reply@github.com');
            const message = `Bump ${update.dependency} to ${update.next}`;
            yield repo.createCommit('HEAD', author, committer, message, treeOID, [
                baseCommit
            ]);
        });
    }
    pushUpdateBranch() {
        // nodegit supports remotes, but we'd have to reconfigure credentials.
        // Let's (ab)use the credentials setup by actions/checkout
        cp.execSync(`git push`).toString();
    }
    gitRepo() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._repo) {
                const path = process.env.GITHUB_WORKSPACE || '.';
                this._repo = yield nodegit_1.Repository.open(path);
            }
            return this._repo;
        });
    }
    /**
     * List versions of a package, in ascending semver order.
     * @param dependency Package name.
     */
    versions(dependency) {
        const npmShow = JSON.parse(cp.execSync(`npm show "${dependency}" --json time`).toString());
        const semVersions = Object.keys(npmShow).filter(s => !!semver_1.default.valid(s));
        return semver_1.default.sort(semVersions);
    }
    /**
     * Stub, we _should_ care about open PRs in the repo eventually right?
     * Wire the octokit.
     */
    openPRs() {
        return __awaiter(this, void 0, void 0, function* () {
            const latestPRs = yield this.octokit.pulls.list({
                owner: this.owner,
                repo: this.repo
            });
            console.log(latestPRs.data);
        });
    }
}
exports.Updater = Updater;
