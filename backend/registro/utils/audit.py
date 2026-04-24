import os


def client_ip(request):
    trusted = {
        ip.strip()
        for ip in os.environ.get("TRUSTED_PROXIES", "").split(",")
        if ip.strip()
    }
    remote = request.META.get("REMOTE_ADDR", "")
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff and remote in trusted:
        return xff.split(",")[0].strip()
    return remote
