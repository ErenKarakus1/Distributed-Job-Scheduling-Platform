type ApiClientOptions = {
  apiBaseUrl: string;
  apiKey: string;
  authToken: string;
};

async function readJsonResponse<T>(response: Response) {
  const body = (await response.json()) as T;

  if (!response.ok) {
    throw new Error(JSON.stringify(body));
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
