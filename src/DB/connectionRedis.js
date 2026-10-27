

import { createClient } from "redis"

export const redis_client = createClient({
  url: "rediss://default:gQAAAAAAAjh2AAIgcDE0Njc2OGNhY2I0ZWI0OTQzODRmZDljOWZkOGIwMTFkZQ@stirred-tiger-145526.upstash.io:6379"
});



export default async function connectionRedis() {
    try {
        await redis_client.connect();
        console.log("connect Redis successfully.......😍");

    } catch (error) {
        console.log("Redis connected failed.......😒");

    }
}