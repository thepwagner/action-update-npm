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
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const update_1 = require("./update");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { context } = github;
            core.debug(`triggering event: ${context.eventName}`);
            switch (context.eventName) {
                case 'repository_vulnerability_alert':
                    yield repositoryVulnerabilityAlert(context);
                    break;
                case 'workflow_dispatch':
                    yield workflowDispatch(context);
                    break;
                default:
                    core.warning(`unhandled event: ${context.eventName}`);
            }
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
function repositoryVulnerabilityAlert(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        const rvaPayload = ctx.payload;
        core.debug(`RepositoryVulnerabilityAlert action: ${rvaPayload.action}`);
        if (rvaPayload.action !== 'create') {
            return;
        }
        const updater = newUpdater(ctx);
        const { alert } = rvaPayload;
        yield updater.update('main', // TODO: what is this really?
        new update_1.Update(alert.affected_package_name, '', alert.fixed_in));
    });
}
function workflowDispatch(ctx) {
    return __awaiter(this, void 0, void 0, function* () {
        const updater = newUpdater(ctx);
        yield updater.updateAll('main');
    });
}
function newUpdater(ctx) {
    const token = core.getInput('token');
    const octokit = github.getOctokit(token);
    return new update_1.Updater(octokit, ctx.repo.owner, ctx.repo.repo);
}
run();
