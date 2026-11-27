// The one Workers runtime module the mailer imports, declared here because the repo takes no Workers types package.
declare module 'cloudflare:workers' {
  export abstract class WorkerEntrypoint<Env = unknown> {
    protected readonly env: Env
    protected readonly ctx: unknown
    constructor(ctx: unknown, env: Env)
    fetch?(request: Request): Promise<Response>
  }
}
