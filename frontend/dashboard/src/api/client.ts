type ApiClientOptions = {
  apiBaseUrl: string;
  apiKey: string;
  authToken: string;
};

type ApiErrorBody = {
  error?: string;
  code?: string;
  message?: string;
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

function formatApiError(response: Response, body: unknown) {
  if (!isErrorBody(body)) {
    return `Request failed with status ${response.status}`;
  }

  const message = body.error ?? body.message;
  const codeSuffix = body.code ? ` (${body.code})` : "";

  return message ? `${message}${codeSuffix}` : `Request failed with status ${response.status}`;
}

async function readJsonResponse<T>(response: Response) {
  const body = (await response.json()) as T;

  if (!response.ok) {
    throw new ApiError(formatApiError(response, body), response.status, body);
  }

  return body;
}

export function createApiClient(options: ApiClientOptions) {
  const { apiBaseUrl, apiKey, authToken } = options;

  async function request<T>(path: string, requestOptions: RequestInit = {}) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestOptions,
      headers: {
        ...(apiKey ? { "x-api-key": apiKey } : {}),
        ...(!apiKey && authToken ? { authorization: `Bearer ${authToken}` } : {}),
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
