export interface WhetherRedisLogicExpireDataType<T> {
  data: T | null;
  isExpired: boolean;
}

export interface RedisLogicExpireData<T> {
  data: T;
  expireTime: number;
}
