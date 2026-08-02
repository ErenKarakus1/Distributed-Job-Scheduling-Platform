type ApiClientOptions = {
  apiBaseUrl: string;
  authToken: string;
};

type ApiErrorBody = {
  error?: string;
  code?: string;
  message?: string;
  issues?: Array<{
    path?: Array<string | number>;
    message?: string;
  }>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  return typeof body === "object" && body !== null;
}

export function formatApiError(response: Pick<Response, "status">, body: unknown) {
  if (!isErrorBody(body)) {
    return `Request failed with status ${response.status}`;
  }

  if (Array.isArray(body.issues) && body.issues.length > 0) {
    return body.issues
      .map((issue) => {
        const field = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : "request";
        return `${field}: ${issue.message ?? "Invalid value"}`;
      })
      .join("; ");
  }

  const message = body.error ?? body.message;
  const codeSuffix = body.code ? ` (${body.code})` : "";

  return message ? `${message}${codeSuffix}` : `Request failed with status ${response.status}`;
}

export async function readJsonResponse<T>(response: Response) {
  const text = await response.text();
  const body = text ? (JSON.parse(text) as T) : undefined;

  if (!response.ok) {
    throw new ApiError(formatApiError(response, body), response.status, body);
  }

  return body as T;
}

export function createApiClient(options: ApiClientOptions) {
  const { apiBaseUrl, authToken } = options;

  async function request<T>(path: string, requestOptions: RequestInit = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestOptions,
      headers: {
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        ...(requestOptions.body ? { "content-type": "application/json" } : {}),
        ...requestOptions.headers,
      },
    });

    return readJsonResponse<T>(response);
  }

  async function authRequest<T>(path: string, requestOptions: RequestInit = {}, token = authToken) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestOptions,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(requestOptions.body ? { "content-type": "application/json" } : {}),
        ...requestOptions.headers,
      },
    });

    return readJsonResponse<T>(response);
  }

  return { authRequest, request };
}
