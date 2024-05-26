// fetch https://api.wakatime.com/api/v1/users/choccy/all_time_since_today and console log the response
fetch("https://api.wakatime.com/api/v1/users/choccy/all_time_since_today")
    .then(response => response.json())
    .then(data => console.log(data));
    