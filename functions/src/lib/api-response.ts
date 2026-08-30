export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta: {
    requestId: string;
  };
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
  meta: {
    requestId: string;
  };
};

export function successResponse<T>(data: T, requestId: string): ApiSuccess<T> {
  return { ok: true, data, meta: { requestId } };
}

export function errorResponse(
  code: string,
  message: string,
  requestId: string,
): ApiFailure {
  return {
    ok: false,
    error: { code, message },
    meta: { requestId },
  };
}
