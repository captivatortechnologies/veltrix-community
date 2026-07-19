{{/*
Common labels
*/}}
{{- define "veltrix.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: veltrix
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{/*
Backend selector labels
*/}}
{{- define "veltrix.backend.selectorLabels" -}}
app.kubernetes.io/name: veltrix-backend
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Frontend selector labels
*/}}
{{- define "veltrix.frontend.selectorLabels" -}}
app.kubernetes.io/name: veltrix-frontend
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Backend fullname
*/}}
{{- define "veltrix.backend.fullname" -}}
{{ .Release.Name }}-backend
{{- end }}

{{/*
Frontend fullname
*/}}
{{- define "veltrix.frontend.fullname" -}}
{{ .Release.Name }}-frontend
{{- end }}

{{/*
Database URL construction
*/}}
{{- define "veltrix.databaseUrl" -}}
{{- if .Values.backend.secrets.databaseUrl -}}
{{ .Values.backend.secrets.databaseUrl }}
{{- else if .Values.postgresql.enabled -}}
postgresql://postgres:{{ .Values.postgresql.auth.postgresPassword }}@{{ .Release.Name }}-postgresql:5432/{{ .Values.postgresql.auth.database }}
{{- else -}}
{{ required "backend.secrets.databaseUrl is required when postgresql.enabled=false" "" }}
{{- end -}}
{{- end }}

{{/*
Redis URL construction
*/}}
{{- define "veltrix.redisUrl" -}}
{{- if .Values.backend.secrets.redisUrl -}}
{{ .Values.backend.secrets.redisUrl }}
{{- else if .Values.redis.enabled -}}
redis://{{ .Release.Name }}-redis-master:6379
{{- else -}}
redis://localhost:6379
{{- end -}}
{{- end }}
