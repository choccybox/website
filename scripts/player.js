let isPlaying = false;

function player() {
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
                document.getElementById("player_image").src = data.image.low;
            } if (data.art === null) {
                document.getElementById("player_image").src = "../styles/spong.webp";
                document.getElementById("player_timeline").style.display = "none";
            } else {
                document.getElementById("player_image").src = data.image.high;
            }
            document.getElementById("player_title").innerHTML = data.name + " • " + data.artist;
        });
}

player();
setInterval(player, 30000);

