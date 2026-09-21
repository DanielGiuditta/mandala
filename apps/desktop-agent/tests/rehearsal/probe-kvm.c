/* A tiny real-mode guest proves KVM execution, not Windows compatibility. */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/kvm.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <unistd.h>

static void fail(const char *operation) {
    fprintf(stderr, "KVM rehearsal capability unavailable: %s: %s\n",
            operation, strerror(errno));
    exit(1);
}

int main(void) {
    int kvm = open("/dev/kvm", O_RDWR | O_CLOEXEC);
    if (kvm < 0) fail("open /dev/kvm");
    if (ioctl(kvm, KVM_GET_API_VERSION, 0) != KVM_API_VERSION) {
        fprintf(stderr, "KVM API version mismatch\n");
        return 1;
    }
    int vm = ioctl(kvm, KVM_CREATE_VM, 0);
    if (vm < 0) fail("create guest");
    void *memory = mmap(NULL, 4096, PROT_READ | PROT_WRITE,
                        MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (memory == MAP_FAILED) fail("allocate guest memory");
    /* mov dx,0x3f8; mov al,'M'; out dx,al; hlt */
    const uint8_t code[] = {0xba, 0xf8, 0x03, 0xb0, 'M', 0xee, 0xf4};
    memcpy(memory, code, sizeof(code));
    struct kvm_userspace_memory_region region = {
        .slot = 0,
        .guest_phys_addr = 0,
        .memory_size = 4096,
        .userspace_addr = (uint64_t)(uintptr_t)memory
    };
    if (ioctl(vm, KVM_SET_USER_MEMORY_REGION, &region) < 0)
        fail("map guest memory");
    int vcpu = ioctl(vm, KVM_CREATE_VCPU, 0);
    if (vcpu < 0) fail("create virtual CPU");
    int size = ioctl(kvm, KVM_GET_VCPU_MMAP_SIZE, 0);
    if (size <= 0) fail("read virtual CPU shared memory size");
    struct kvm_run *run = mmap(NULL, (size_t)size, PROT_READ | PROT_WRITE,
                               MAP_SHARED, vcpu, 0);
    if (run == MAP_FAILED) fail("map virtual CPU state");
    struct kvm_sregs sregs;
    if (ioctl(vcpu, KVM_GET_SREGS, &sregs) < 0) fail("read guest registers");
    sregs.cs.base = 0;
    sregs.cs.selector = 0;
    if (ioctl(vcpu, KVM_SET_SREGS, &sregs) < 0) fail("write guest segments");
    struct kvm_regs regs = {.rip = 0, .rflags = 2, .rsp = 4096};
    if (ioctl(vcpu, KVM_SET_REGS, &regs) < 0) fail("write guest registers");
    int observed_output = 0;
    for (int exits = 0; exits < 4; exits++) {
        if (ioctl(vcpu, KVM_RUN, 0) < 0) fail("execute guest");
        if (run->exit_reason == KVM_EXIT_IO &&
            run->io.direction == KVM_EXIT_IO_OUT && run->io.port == 0x3f8 &&
            run->io.size == 1 && run->io.count == 1 &&
            *((uint8_t *)run + run->io.data_offset) == 'M') {
            observed_output = 1;
        } else if (run->exit_reason == KVM_EXIT_HLT && observed_output) {
            puts("PASS: a hardware-accelerated nested x86 guest executed and halted.");
            puts("LIMIT: no Windows boot, gateway repair, restart or time save was tested.");
            munmap(run, (size_t)size);
            munmap(memory, 4096);
            close(vcpu);
            close(vm);
            close(kvm);
            return 0;
        } else {
            fprintf(stderr, "Unexpected KVM exit: %u\n", run->exit_reason);
            return 1;
        }
    }
    fprintf(stderr, "Nested guest failed to reach its expected halt\n");
    return 1;
}
