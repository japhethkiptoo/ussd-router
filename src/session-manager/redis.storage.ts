import {  SessionStorage } from "@/types";
import { createClient, RedisClientType} from 'redis'

export type RedisOptions = {
  host: string;
  port: string;
  username: string;
  password: string
}


export class RedisStorage implements SessionStorage {

  private client: RedisClientType;

   constructor(options: RedisOptions) {
     //[[username][:password]@][host][:port][/db-number]
     const { host, username, password, port } = options;
     const url = `${username}:${password}@${host}:${port}`;

     this.client = createClient({
         url
       });
   }

   async get(key: string): Promise<any | null> {
     try {
     // Connect to Redis if not already connected
      if (!this.client.isOpen) {
        await this.client.connect();
      }

      const value = await this.client.get(key);
      // Parse the JSON string if it exists
      return value ? JSON.parse(value) : null;
     } catch(error) {
       throw error
     }
   }

   async set(key: string, value: string): Promise<void> {
     try {
        // Connect to Redis if not already connected
        if (!this.client.isOpen) {
          await this.client.connect();
        }

        // Convert value to JSON string before storing
        const stringValue = JSON.stringify(value);
        await this.client.set(key, stringValue);
      } catch (error) {
        console.error('Redis set error:', error);
        throw error;
      }
   }

   async delete(key: string): Promise<void> {
     try {
        // Connect to Redis if not already connected
        if (!this.client.isOpen) {
          await this.client.connect();
        }

        await this.client.del(key);
      } catch (error) {
        console.error('Redis delete error:', error);
        throw error;
      }
   }


     async disconnect(): Promise<void> {
       try {
         if (this.client.isOpen) {
           await this.client.quit();
         }
       } catch (error) {
         console.error('Redis disconnect error:', error);
         throw error;
       }
     }

}
