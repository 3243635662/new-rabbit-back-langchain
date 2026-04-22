#!/usr/bin/env python3
import chromadb

print("🔌 连接 Docker 中的 Chroma (localhost:8000)...")
try:
    # ✅ 使用 HttpClient 连接 HTTP 服务
    client = chromadb.HttpClient(host="localhost", port=8000)
    
    # 测试连接
    hb = client.heartbeat()
    print(f"✅ 连接成功！Heartbeat: {hb}")
    
    # 📦 列出所有集合
    print("\n📦 集合列表:")
    collections = client.list_collections()
    if not collections:
        print("  (空)")
    for i, coll in enumerate(collections, 1):
        # 尝试获取文档数
        try:
            count = coll.count() if hasattr(coll, 'count') and callable(coll.count) else "?"
        except:
            count = "?"
        print(f"  {i}. {coll.name} ({count} docs)")
    
    # 🗑️ 删除功能（取消下面三行注释启用）
    name = "ecommerce_knowledge_base"  # ← 改成你要删的集合名
    client.delete_collection(name)
    print(f"🗑️ 已删除: {name}")
    
except Exception as e:
    print(f"❌ 连接失败: {e}")
    print("💡 确认: 1) Docker 容器在运行  2) 端口 8000 已映射")