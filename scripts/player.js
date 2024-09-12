let isPlaying = false;

function fetchAndDisplayTime() {
    fetch('/player')
        .then(response => response.json())
        .then(data => {
            isPlaying = data.isPlaying;
            
            var isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

            // Check if user is using cellular data
            var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            var isCellular = false;

            if (connection && connection.type === 'cellular') {
                isCellular = true;
            }

            console.log("📱 is mobile player?", isMobile);
            console.log("📶 is cellular player?", isCellular);

            // if user is on mobile, set the avatar to the mobile avatar
            if (isMobile && isCellular) {
                document.getElementById("player_image").src = data.art.low;
            } else {
                document.getElementById("player_image").src = data.art.high;
            }

            if (data.art === null) {
                document.getElementById("player_image").src = "/assets/album.png";
            }

            document.getElementById("player_link").href = data.url;
            document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
        });
}

fetchAndDisplayTime();
setInterval(fetchAndDisplayTime, 30000);

