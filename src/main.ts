import * as core from '@actions/core'
import * as github from '@actions/github'
import {Context} from '@actions/github/lib/context'
import {EventPayloads} from '@octokit/webhooks'
import {Update, Updater} from './update'
import {Octokit} from '@octokit/rest'

async function run(): Promise<void> {
  try {
    const {context} = github
    core.debug(`triggering event: ${context.eventName}`)
    switch (context.eventName) {
      case 'repository_vulnerability_alert':
        await repositoryVulnerabilityAlert(context)
        break

      case 'workflow_dispatch':
        await workflowDispatch(context)
        break

      default:
        core.warning(`unhandled event: ${context.eventName}`)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function repositoryVulnerabilityAlert(ctx: Context): Promise<void> {
  const rvaPayload = ctx.payload as EventPayloads.WebhookPayloadRepositoryVulnerabilityAlert
  core.debug(`RepositoryVulnerabilityAlert action: ${rvaPayload.action}`)
  if (rvaPayload.action !== 'create') {
    return
  }
  const updater = newUpdater(ctx)

  const {alert} = rvaPayload
  await updater.update(
    'main', // TODO: what is this really?
    new Update(alert.affected_package_name, '', alert.fixed_in)
  )
}

async function workflowDispatch(ctx: Context): Promise<void> {
  const updater = newUpdater(ctx)
  await updater.updateAll('main')
}

function newUpdater(ctx: Context): Updater {
  const token = core.getInput('token')
  const octokit = github.getOctokit(token) as Octokit
  return new Updater(octokit, ctx.repo.owner, ctx.repo.repo)
}

run()
