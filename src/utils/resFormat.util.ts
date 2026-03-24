import { IApiResponse } from '../types/response.type';

export const resFormatMethod = <T>(
  code: number,
  message: string,
  result: T | null = null,
): IApiResponse<T> => {
  return {
    code,
    result,
    message,
  };
};
