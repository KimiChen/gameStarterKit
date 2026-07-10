import { listen } from "@colyseus/tools";
import app from "./app.config";

// 端口取 PORT 环境变量，默认 2567
listen(app);
