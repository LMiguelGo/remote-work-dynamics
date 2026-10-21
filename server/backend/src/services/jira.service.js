const config = require('../config/index');

// Convierte una fecha de Jira a formato ISO, o null si no es valida.
function aIso(valor) {
  // new Date(null) es 1970-01-01 (fecha valida), asi que null y vacio se descartan antes.
  if (valor == null || valor === '') return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Convierte los story points de Jira a numero, o null si vienen vacios.
function aPuntos(valor) {
  return valor === '' || valor == null || Number.isNaN(Number(valor)) ? null : Number(valor);
}

// Devuelve [{ accountId, eventType, payload, time }]
function jiraAEventos(body) {
  const issue = body && body.issue;
  if (!issue) return [];
  const f = issue.fields || {};
  const accountId = f.assignee?.accountId || f.reporter?.accountId;
  const storyPoints = aPuntos(f[config.JIRA_STORY_POINTS_FIELD]);

  if (body.webhookEvent === 'jira:issue_created') {
    return [{
      accountId,
      eventType: 'issue_created',
      time: aIso(f.created),
      payload: {
        issue_key: issue.key,
        issue_type: f.issuetype?.name || null,
        story_points: storyPoints,
      },
    }];
  }

  if (body.webhookEvent === 'jira:issue_updated') {
    const cambio = (body.changelog?.items || []).find((i) => i.field === 'status');
    if (!cambio) return [];
    // Sin resolutiondate (la tarea aun no esta resuelta) no hay tiempo de resolucion.
    const creada = f.created ? new Date(f.created) : null;
    const resuelta = f.resolutiondate ? new Date(f.resolutiondate) : null;
    const horas = !creada || !resuelta || Number.isNaN(creada.getTime()) || Number.isNaN(resuelta.getTime())
      ? null
      : Math.round(((resuelta - creada) / 3.6e6) * 10) / 10;
    return [{
      accountId,
      eventType: 'issue_updated',
      time: null,
      payload: {
        issue_key: issue.key,
        status_from: cambio.fromString,
        status_to: cambio.toString,
        story_points: storyPoints,
        resolution_time_hours: horas,
        blocked_time_hours: null,
      },
    }];
  }

  return [];
}

module.exports = { jiraAEventos };
