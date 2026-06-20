const dotenv = require('dotenv');
const path = require('path');

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const testOrder = {
    id: 99999,
    customer_name: "Test Customer",
    customer_email: "mamidipalliamithasreshta@gmail.com",
    customer_phone: "7207121484",
    customer_address: "6-12-70 Ganesh Basti Opp. Sravani medical distributors, Kothagudem",
    customer_pincode: "507101",
    grand_total: 550,
    items: [
        {
            name: "Nutri Ladoo 500g",
            weight: "500g",
            quantity: 1,
            price: 550
        }
    ]
};

async function getNimbuspostToken() {
    const email = process.env.NIMBUSPOST_EMAIL;
    const password = process.env.NIMBUSPOST_PASSWORD;

    if (!email || !password) {
        throw new Error("NimbusPost email or password is not configured in environment variables.");
    }

    console.log(`NimbusPost Login: Email = ${email}, Password = ${password}`);
    const response = await fetch('https://api.nimbuspost.com/v1/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    if (!response.ok || !data.status) {
        throw new Error(data.message || `Login failed with status ${response.status}`);
    }

    return data.data;
}

async function resolvePincode(pincode) {
    try {
        const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
        if (!response.ok) return null;
        const data = await response.json();
        if (data && data[0] && data[0].Status === "Success" && data[0].PostOffice && data[0].PostOffice[0]) {
            const po = data[0].PostOffice[0];
            return {
                city: po.District,
                state: po.State
            };
        }
    } catch (e) {
        console.error(`Pincode resolution failed for ${pincode}:`, e.message);
    }
    return null;
}

async function testPush() {
    try {
        console.log("Resolving pincode...");
        let customerCity = "Kothagudem";
        let customerState = "Telangana";
        const locationDetails = await resolvePincode(testOrder.customer_pincode);
        if (locationDetails) {
            customerCity = locationDetails.city;
            customerState = locationDetails.state;
        }
        console.log(`Pincode resolved: ${customerCity}, ${customerState}`);

        const token = await getNimbuspostToken();
        console.log("NimbusPost token fetched successfully.");

        const payload = {
            order_number: `#${testOrder.id}`,
            shipping_charges: 0,
            discount: 0,
            cod_charges: 0,
            payment_type: "prepaid",
            order_amount: testOrder.grand_total,
            package_weight: 500,
            package_length: 15,
            package_breadth: 15,
            package_height: 10,
            request_auto_pickup: "yes",
            consignee: {
                name: testOrder.customer_name,
                address: testOrder.customer_address,
                address_2: "",
                city: customerCity,
                state: customerState,
                pincode: testOrder.customer_pincode,
                phone: testOrder.customer_phone,
                email: testOrder.customer_email || "customer@example.com"
            },
            pickup: {
                warehouse_name: process.env.NIMBUSPOST_PICKUP_WAREHOUSE_NAME || "Sreshta Nutri Mithai",
                name: process.env.NIMBUSPOST_PICKUP_NAME || "Chaitanya Rani",
                address: process.env.NIMBUSPOST_PICKUP_ADDRESS || "6-12-70 Ganesh Basti Opp. Sravani medical distributors, Kothagudem",
                address_2: process.env.NIMBUSPOST_PICKUP_ADDRESS_2 || "",
                city: process.env.NIMBUSPOST_PICKUP_CITY || "Kothagudem",
                state: process.env.NIMBUSPOST_PICKUP_STATE || "Telangana",
                pincode: process.env.NIMBUSPOST_PICKUP_PINCODE || "507101",
                phone: process.env.NIMBUSPOST_PICKUP_PHONE || "7207121484"
            },
            order_items: [
                {
                    name: "Nutri Ladoo 500g",
                    qty: "1",
                    price: "550",
                    sku: `sku-${testOrder.id}-0`
                }
            ],
            is_insurance: "0"
        };

        console.log("Payload to push:", JSON.stringify(payload, null, 2));

        const response = await fetch('https://api.nimbuspost.com/v1/shipments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const resData = await response.json();
        console.log("Response Status:", response.status);
        console.log("Response Body:", JSON.stringify(resData, null, 2));
    } catch (err) {
        console.error("Test push failed with exception:", err);
    }
}

testPush();
