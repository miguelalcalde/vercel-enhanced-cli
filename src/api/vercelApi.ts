const VERCEL_API_BASE = "https://api.vercel.com"

export interface VercelTeam {
  id: string
  name: string
  slug: string
}

export interface VercelProject {
  id: string
  name: string
  accountId: string
  updatedAt: number
  createdAt: number
  link?: {
    type: string
    repo: string
    repoId: number
    org: string
    repoOwner: string
    repoName: string
  }
}

export interface VercelDeployment {
  uid: string
  name: string
  url: string
  state: "BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED"
  createdAt: number
  createdAtTimestamp: number
  buildingAt?: number
  readyAt?: number
}

export interface VercelUser {
  uid: string
  email: string
  username: string
  name?: string
}

interface VercelApiResponse<T> {
  [key: string]: T | T[] | any
}

interface PaginatedResponse<T> {
  projects?: T[]
  teams?: T[]
  deployments?: T[]
  pagination?: {
    count: number
    next?: number | null
    prev?: number | null
  }
}

/**
 * Vercel REST API client
 */
export class VercelApi {
  private token: string
  private baseUrl: string

  constructor(token: string) {
    this.token = token
    this.baseUrl = VERCEL_API_BASE
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retries: number = 3
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            ...options.headers,
          },
        })

        // Handle rate limiting (429) with exponential backoff
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After")
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.pow(2, attempt) * 1000 // Exponential backoff: 1s, 2s, 4s, 8s

          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, delay))
            continue // Retry
          }
        }

        // Handle server errors (5xx) with retry
        if (response.status >= 500 && response.status < 600) {
          if (attempt < retries) {
            const delay = Math.pow(2, attempt) * 1000
            await new Promise((resolve) => setTimeout(resolve, delay))
            continue // Retry
          }
        }

        if (response.status === 401 || response.status === 403) {
          throw new Error(
            "Authentication failed. Please run `vercel login` to refresh your token."
          )
        }

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            `Vercel API error (${response.status}): ${
              errorText || response.statusText
            }`
          )
        }

        // Check if response has content before parsing JSON
        const contentType = response.headers.get("content-type") || ""
        const contentLength = response.headers.get("content-length")

        // Handle empty responses (common for DELETE requests)
        if (
          contentLength === "0" ||
          response.status === 204 ||
          (contentType && !contentType.includes("application/json"))
        ) {
          return undefined as T
        }

        // Try to parse JSON, but handle empty body gracefully
        const text = await response.text()
        if (!text || text.trim().length === 0) {
          return undefined as T
        }

        try {
          return JSON.parse(text) as T
        } catch (parseError) {
          // If JSON parsing fails but response was OK, return undefined
          // This handles cases where API returns empty or non-JSON responses
          if (response.ok) {
            return undefined as T
          }
          throw parseError
        }
      } catch (error) {
        // If it's a network error and we have retries left, retry
        if (
          attempt < retries &&
          (error instanceof TypeError || // Network error
            (error instanceof Error && error.message.includes("fetch")))
        ) {
          const delay = Math.pow(2, attempt) * 1000
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }
        throw error
      }
    }

    throw new Error("Request failed after retries")
  }

  /**
   * Get current user information
   */
  async getCurrentUser(): Promise<VercelUser> {
    const response = await this.request<{ user: VercelUser }>("/v2/user")
    return response.user
  }

  /**
   * List all teams the user belongs to
   */
  async listTeams(): Promise<VercelTeam[]> {
    const response = await this.request<PaginatedResponse<VercelTeam>>(
      "/v2/teams"
    )
    return response.teams || []
  }

  /**
   * List projects for a team (or personal account if teamId is null)
   * Handles pagination automatically
   */
  async listProjects(teamId?: string | null): Promise<VercelProject[]> {
    const allProjects: VercelProject[] = []
    let next: number | null | undefined = null

    do {
      const params = new URLSearchParams()
      if (teamId) {
        params.append("teamId", teamId)
      }
      if (next !== null && next !== undefined) {
        params.append("until", next.toString())
      }

      const endpoint = `/v9/projects${
        params.toString() ? `?${params.toString()}` : ""
      }`
      const response = await this.request<PaginatedResponse<VercelProject>>(
        endpoint
      )

      if (response.projects) {
        allProjects.push(...response.projects)
      }

      next = response.pagination?.next ?? null
    } while (next !== null && next !== undefined)

    return allProjects
  }

  /**
   * List deployments for a project (or all projects if projectId is not provided)
   * Returns deployments sorted by createdAt descending (newest first)
   * Handles pagination up to the specified limit
   */
  async listDeployments(
    options: {
      teamId?: string | null
      projectId?: string
      limit?: number
    } = {}
  ): Promise<VercelDeployment[]> {
    const allDeployments: VercelDeployment[] = []
    const maxLimit = options.limit || 100
    let next: number | null | undefined = null

    do {
      const params = new URLSearchParams()
      if (options.teamId) {
        params.append("teamId", options.teamId)
      }
      if (options.projectId) {
        params.append("projectId", options.projectId)
      }
      params.append(
        "limit",
        Math.min(100, maxLimit - allDeployments.length).toString()
      )

      if (next !== null && next !== undefined) {
        params.append("until", next.toString())
      }

      const endpoint = `/v6/deployments${
        params.toString() ? `?${params.toString()}` : ""
      }`
      const response = await this.request<PaginatedResponse<VercelDeployment>>(
        endpoint
      )

      if (response.deployments) {
        allDeployments.push(...response.deployments)
      }

      next = response.pagination?.next ?? null

      // Stop if we've reached the limit or there's no more data
      if (allDeployments.length >= maxLimit || next === null) {
        break
      }
    } while (next !== null && next !== undefined)

    return allDeployments.slice(0, maxLimit)
  }

  /**
   * Delete a project by ID
   */
  async deleteProject(
    projectId: string,
    teamId?: string | null
  ): Promise<void> {
    const params = new URLSearchParams()
    if (teamId) {
      params.append("teamId", teamId)
    }

    const endpoint = `/v9/projects/${projectId}${
      params.toString() ? `?${params.toString()}` : ""
    }`
    await this.request(endpoint, {
      method: "DELETE",
    })
  }
}
