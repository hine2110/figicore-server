const axios = require('axios');

async function test() {
    try {
        const payload = {
            payment_type_id: 1,
            from_district_id: 1534, // Da Nang
            to_district_id: 3440, // Lao Cai
            to_ward_code: '80508',
            weight: 400,
            length: 10,
            width: 10,
            height: 10,
            service_type_id: 2,
            insurance_value: 1000000 // 1 million vnd
        };

        const res = await axios.post('https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee', payload, {
            headers: {
                Token: '8bbce3ff-f8fd-11f0-a3d6-dac90fb956b5',
                ShopId: '199205'
            }
        });
        console.log('Fee from Da Nang to Lao Cai (400g) WITH 1M Insurance:', res.data.data.total);

        payload.insurance_value = 0;
        const res2 = await axios.post('https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee', payload, {
            headers: {
                Token: '8bbce3ff-f8fd-11f0-a3d6-dac90fb956b5',
                ShopId: '199205'
            }
        });
        console.log('Fee from Da Nang to Lao Cai (400g) WITHOUT Insurance:', res2.data.data.total);

    } catch (e) {
        console.error(e.response?.data);
    }
}

test();
