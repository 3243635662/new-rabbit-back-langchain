// 这里存放auth模块有关的一些类型

//* 定义JWT payload的类型结构
export interface JwtPayloadType {
  username: string;
  id: string; // uuid
  role: string;
  iat: number; // 签发时间
  exp: number; // 过期时间
}
