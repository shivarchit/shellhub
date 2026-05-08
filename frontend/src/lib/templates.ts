import type { Server, TemplateVariable } from './types'

/**
 * Parse template variables from a command string.
 * Supports: {{variable_name}} and {{variable_name:default_value}}
 */
export function parseTemplateVariables(command: string): TemplateVariable[] {
  const regex = /\{\{([^}]+)\}\}/g
  const vars: TemplateVariable[] = []
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = regex.exec(command)) !== null) {
    const raw = match[1].trim()
    const parts = raw.split(':')
    const name = parts[0].trim()
    const defaultValue = parts.slice(1).join(':').trim()

    if (!seen.has(name)) {
      seen.add(name)
      vars.push({ name, defaultValue })
    }
  }
  return vars
}

/**
 * Built-in variables that are auto-resolved from the server context.
 */
const BUILTIN_VARS = ['hostname', 'username', 'port', 'date', 'server_name']

export function isBuiltinVariable(name: string): boolean {
  return BUILTIN_VARS.includes(name)
}

/**
 * Resolve built-in variables using server context.
 */
export function resolveBuiltinVariables(command: string, server: Server): string {
  return command
    .replace(/\{\{hostname\}\}/g, server.host)
    .replace(/\{\{username\}\}/g, server.username)
    .replace(/\{\{port\}\}/g, String(server.port))
    .replace(/\{\{server_name\}\}/g, server.name)
    .replace(/\{\{date\}\}/g, new Date().toISOString().split('T')[0])
}

/**
 * Resolve custom variables with user-supplied values.
 */
export function resolveCustomVariables(
  command: string,
  values: Record<string, string>
): string {
  return command.replace(/\{\{([^}]+)\}\}/g, (fullMatch, raw: string) => {
    const name = raw.trim().split(':')[0].trim()
    if (name in values) {
      return values[name]
    }
    return fullMatch
  })
}

/**
 * Get custom (non-builtin) variables that need user input.
 */
export function getCustomVariables(command: string): TemplateVariable[] {
  return parseTemplateVariables(command).filter(v => !isBuiltinVariable(v.name))
}

/**
 * Check if a command has template variables that need user prompting.
 */
export function hasCustomVariables(command: string): boolean {
  return getCustomVariables(command).length > 0
}
