const PREFIJOS = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?!?:/;

// Devuelve [{ login, eventType, payload, time }]
function githubAEventos(tipo, body) {
  if (tipo === 'pull_request' && ['opened', 'reopened', 'closed'].includes(body.action)) {
    const pr = body.pull_request;
    return [{
      login: pr.user.login,
      eventType: 'pull_request',
      time: pr.updated_at,
      payload: {
        pr_number: pr.number,
        action: pr.merged ? 'merged' : body.action,
        lines_added: pr.additions,
        lines_deleted: pr.deletions,
        files_changed: pr.changed_files,
      },
    }];
  }
  if (tipo === 'pull_request_review' && body.action === 'submitted') {
    const { review: r, pull_request: pr } = body;
    return [{
      login: r.user.login,
      eventType: 'pull_request_review',
      time: r.submitted_at,
      payload: {
        pr_number: pr.number,
        is_first_attempt_approved: null,   // pendiente: requiere contar revisiones previas del PR
        review_responsiveness_minutes:
          Math.round(((new Date(r.submitted_at) - new Date(pr.created_at)) / 60000) * 10) / 10,
        pr_comment_density: pr.review_comments,
      },
    }];
  }
  if (tipo === 'push') {
    return (body.commits || []).map((c) => ({
      login: c.author.username || body.sender.login,
      eventType: 'commit',
      time: c.timestamp,
      payload: {
        commit_hash: c.id.slice(0, 7),
        conventional_commit_prefix: (c.message.match(PREFIJOS) || [])[1] || null,
        lines_added: null,   // el push no trae líneas; ver nota
        lines_deleted: null,
      },
    }));
  }
  return [];
}
module.exports = { githubAEventos };
