// app/api/get-access-token/route.js
export async function POST() {
    try {
        // Використовуємо правильну назву змінної оточення
        const HEYGEN_API_KEY = process.env.NEXT_PUBLIC_HEYGEN_API_KEY;

        if (!HEYGEN_API_KEY) {
            console.error("API key is missing");
            throw new Error("HEYGEN_API_KEY is missing from environment variables");
        }

        console.log("Making request to HeyGen API...");

        const response = await fetch("https://api.heygen.com/v1/streaming.create_token", {
            method: "POST",
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "x-api-key": HEYGEN_API_KEY
            }
        });

        // Спочатку отримуємо текст відповіді
        const responseText = await response.text();

        console.log("Response status:", response.status);
        console.log("Response headers:", Object.fromEntries(response.headers));
        console.log("Response body:", responseText);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        // Перевіряємо, чи відповідь не порожня
        if (!responseText) {
            throw new Error("Empty response from API");
        }

        // Парсимо JSON тільки якщо є що парсити
        const data = JSON.parse(responseText);

        if (!data.data?.token) {
            throw new Error("No token in response");
        }

        // Повертаємо тільки токен
        return new Response(data.data.token, {
            status: 200,
            headers: {
                "Content-Type": "text/plain",
            },
        });

    } catch (error) {
        console.error("Error details:", {
            message: error.message,
            stack: error.stack,
        });

        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
    }
}